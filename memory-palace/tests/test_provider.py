import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import ai_provider as provider

CONFIG = {'PALACE_AI_PROVIDER': 'openai-compatible', 'PALACE_AI_BASE_URL': 'https://example.invalid/v1',
          'PALACE_AI_MODEL': 'chosen-by-user', 'PALACE_AI_API_KEY': 'test-only-not-a-real-key'}


def agent_config(script, *args):
    return {provider.COMMAND_SETTING: json.dumps([sys.executable, '-c', script, *args])}


class ProviderTests(unittest.TestCase):
    def test_unconfigured_never_calls_network(self):
        with patch.object(provider, 'configuration', return_value={}), \
             patch.object(provider, 'http_post') as network, patch.object(provider, 'exchange_agent') as agent:
            self.assertFalse(provider.status()['configured'])
            self.assertEqual(provider.status()['message'], '等待連接你的 AI Agent')
            with self.assertRaises(provider.ProviderNotConfigured):
                provider.infer({'message': '先保留這段話'})
            network.assert_not_called()
            agent.assert_not_called()

    def test_agent_settings_read_from_local_file_and_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'ai.env'
            config.write_text(f'{provider.COMMAND_SETTING}=["/some/path", "arg with spaces"]\n')
            with patch.object(provider, 'CONFIG', config), patch.dict(provider.os.environ, {}, clear=True):
                self.assertEqual(provider.agent_command(provider.configuration()), ['/some/path', 'arg with spaces'])
            with patch.object(provider, 'CONFIG', config), patch.dict(provider.os.environ,
                                                                       {provider.COMMAND_SETTING: '["env-path"]'}):
                self.assertEqual(provider.agent_command(provider.configuration()), ['env-path'])

    def test_agent_uses_literal_arguments_and_versioned_input(self):
        script = '''
import json
from pathlib import Path
import sys

data = json.load(sys.stdin)
assert data["protocol"] == "memory-palace.agent.v1"
assert "一次問一個" in data["instructions"]
assert data["response_schema"]["properties"]["intent"]["enum"] == ["remember", "recall", "chat"]
assert data["input"]["message"] == "想聊聊今天"
assert data["input"]["capture"]["text"] == "原文" * 45000
assert data["input"]["placement"] == {"room_id": "hall", "locus_id": "holo-desk"}
assert Path.cwd() == Path(sys.argv[2])
print("stderr is never returned", file=sys.stderr)
print(json.dumps({"reply": sys.argv[1], "intent": "chat", "memories": [], "recall_ids": [],
                  "steward_id": "hall", "clarification": "", "observed_image_text": "unverified",
                  "_verified_image_text": "unverified"}))
'''
        literal_arg = '今天哪件小事最值得留住？ $(echo ignored); *'
        with patch.object(provider, 'configuration', return_value=agent_config(script, literal_arg, str(provider.ROOT))), \
             patch.object(provider, 'http_post') as network:
            status = provider.status()
            self.assertTrue(status['configured'])
            self.assertEqual(status['provider'], 'agent')
            self.assertFalse(status['connection_verified'])
            self.assertNotIn(literal_arg, json.dumps(status))
            result = provider.infer({'message': '想聊聊今天', 'capture': {'text': '原文' * 45000},
                                     'placement': {'room_id': 'hall', 'locus_id': 'holo-desk'}})
            self.assertEqual(result['reply'], literal_arg)
            self.assertEqual(result['_verified_image_text'], '')
            network.assert_not_called()

    def test_agent_invalid_command_does_not_execute(self):
        invalid_commands = ('agent --mode test', '"agent --mode test"', '[]', '[""]', '["agent", 5]', '["agent\\u0000"]')
        for invalid in invalid_commands:
            with self.subTest(command=invalid), \
                 patch.object(provider, 'configuration', return_value={provider.COMMAND_SETTING: invalid}), \
                 patch.object(provider, 'exchange_agent') as agent:
                self.assertFalse(provider.status()['configured'])
                with self.assertRaisesRegex(provider.ProviderError, 'JSON'):
                    provider.infer({'message': '保留原文'})
                agent.assert_not_called()

    def test_agent_failed_or_malformed_output_stays_private(self):
        scripts = (
            "import sys; sys.stdin.read(); print('{private conversation')",
            "import sys; sys.stdin.read(); print('private conversation', file=sys.stderr); sys.exit(1)",
            "import sys; sys.stdin.read(); sys.stdout.buffer.write(b'\\xff')",
        )
        for script in scripts:
            with self.subTest(script=script), patch.object(provider, 'configuration', return_value=agent_config(script)):
                with self.assertRaises(provider.ProviderError) as error:
                    provider.infer({'message': '保留原文'})
                self.assertNotIn('private conversation', str(error.exception))

    def test_agent_output_and_runtime_are_bounded(self):
        long_output = 'import sys; sys.stdin.read(); print("x" * (3 * 1024 * 1024))'
        with patch.object(provider, 'configuration', return_value=agent_config(long_output)):
            with self.assertRaisesRegex(provider.ProviderError, '2 MiB'):
                provider.infer({'message': '保留原文'})
        sleeping = 'import sys, time; sys.stdin.read(); time.sleep(10)'
        with patch.object(provider, 'configuration', return_value=agent_config(sleeping)), \
             patch.object(provider, 'AGENT_TIMEOUT', 0.25):
            with self.assertRaisesRegex(provider.ProviderError, '逾時'):
                provider.infer({'message': '保留原文'})

    def test_agent_receives_raw_screenshot_only_with_vision_enabled(self):
        image = 'data:image/png;base64,test'
        script = '''
import json, sys
data = json.load(sys.stdin)["input"]
assert data["local_image_text"] == "verified OCR"
assert ("image_data_url" in data["capture"]) == (sys.argv[1] == "true")
print('{"reply":"OK","_verified_image_text":"unverified claim"}')
'''
        for vision in ('true', 'false'):
            config = {**agent_config(script, vision), 'PALACE_AI_VISION': vision}
            with self.subTest(vision=vision), patch.object(provider, 'configuration', return_value=config), \
                 patch.object(provider, 'recognize_image', return_value='verified OCR'):
                result = provider.infer({'message': '', 'capture': {'image_data_url': image}})
                self.assertEqual(result['_verified_image_text'], 'verified OCR')

    def test_openai_contract_and_untrusted_ocr_override(self):
        answer = {'reply': '收到', 'intent': 'chat', 'memories': [], 'recall_ids': [],
                  'steward_id': 'hall', 'clarification': '', 'observed_image_text': 'model claim',
                  '_verified_image_text': 'untrusted model claim'}
        with patch.object(provider, 'configuration', return_value=CONFIG), patch.object(provider, 'http_post', return_value={
            'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(answer)}}]}) as network:
            result = provider.infer({'message': '你好', 'catalog': []})
            self.assertEqual(result['_verified_image_text'], '')
            url, headers, payload = network.call_args.args
            self.assertEqual(url, 'https://example.invalid/v1/chat/completions')
            self.assertEqual(payload['response_format']['json_schema']['strict'], True)
            self.assertEqual(payload['model'], CONFIG['PALACE_AI_MODEL'])
            self.assertNotIn('test-only', json.dumps(provider.status()))

    def test_incomplete_response_is_not_treated_as_memory(self):
        with patch.object(provider, 'configuration', return_value=CONFIG), patch.object(provider, 'http_post', return_value={
            'choices': [{'finish_reason': 'length', 'message': {'content': '{'}}]}):
            with self.assertRaises(provider.ProviderError):
                provider.infer({'message': '一段記憶'})

    def test_reject_plaintext_remote_endpoint(self):
        with patch.object(provider, 'configuration', return_value={**CONFIG, 'PALACE_AI_BASE_URL': 'http://example.invalid/v1'}), patch.object(provider, 'http_post') as network:
            with self.assertRaises(provider.ProviderError):
                provider.infer({'message': '一段記憶'})
            network.assert_not_called()

    def test_anthropic_response(self):
        config = {**CONFIG, 'PALACE_AI_PROVIDER': 'anthropic'}
        with patch.object(provider, 'configuration', return_value=config), patch.object(provider, 'http_post', return_value={
            'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': '{"reply":"你好"}'}]}) as network:
            self.assertEqual(provider.infer({'message': '你好'})['reply'], '你好')
            self.assertEqual(network.call_args.args[0], 'https://example.invalid/v1/messages')

if __name__ == '__main__':
    unittest.main()
