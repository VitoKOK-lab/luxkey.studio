import base64
import http.client
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path

from ai_butler import AIButler, AwaitingAPI
from palace_store import LOCI, PalaceStore
from server import create_server


def extracted(quote, **overrides):
    return {
        'title': '桂花', 'body': quote, 'summary': '桂花開花時間', 'source_quote': quote,
        'mnemonic': '{locus}把桂花像煙火一樣噴出來', 'cue': '花香',
        'room_id': 'garden', 'locus_id': LOCI['garden'][0], 'tags': ['花'],
        **overrides,
    }


def answer(intent='remember', memories=(), recall_ids=(), **overrides):
    return {
        'intent': intent, 'steward_id': 'garden', 'reply': '我整理了這段內容。',
        'memories': list(memories), 'recall_ids': list(recall_ids), 'clarification': '',
        **overrides,
    }


class AIButlerTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.db = Path(folder.name) / 'vault.sqlite3'
        self.outputs = []
        self.inputs = []
        self.server = create_server(0, self.db, self.infer, lambda: {'available': True})
        thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': 0.01})
        thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(thread.join)
        self.addCleanup(self.server.shutdown)

    def infer(self, payload):
        self.inputs.append(payload)
        output = self.outputs.pop(0)
        if isinstance(output, Exception):
            raise output
        return output

    def request(self, method, path, body=None):
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        try:
            headers = {'Content-Type': 'application/json'} if body is not None else {}
            client.request(method, path, None if body is None else json.dumps(body), headers)
            response = client.getresponse()
            return response.status, json.loads(response.read())
        finally:
            client.close()

    def submit(self, request_id, message='', capture=None, placement=None):
        payload = {'request_id': request_id, 'message': message}
        if capture is not None:
            payload['capture'] = capture
        if placement is not None:
            payload['placement'] = placement
        status, response = self.request('POST', '/api/chat', payload)
        self.assertEqual(status, 202, response)
        return response['job_id']

    def wait(self, job_id, expected='completed'):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status, response = self.request('GET', f'/api/jobs/{job_id}')
            self.assertEqual(status, 200)
            if response['status'] not in ('queued', 'running'):
                self.assertEqual(response['status'], expected, response)
                return response
            time.sleep(0.01)
        self.fail('AI job did not settle')

    def test_capture_source_placement_idempotency_and_recall(self):
        quote = '桂花在十月開花'
        capture = {'text': f'\n訪談：{quote}，香味濃。\n', 'source': '訪談筆記'}
        self.outputs.append(answer(memories=[extracted(quote, body='模型多寫了內容')]))
        job_id = self.submit('same-request', '請放進莊園', capture)
        result = self.wait(job_id)['result']
        saved, = result['memories']
        self.assertEqual(saved['body'], quote)
        self.assertEqual(saved['source_quote'], quote)
        self.assertEqual(saved['locus_id'], LOCI['garden'][0])
        self.assertNotIn('{locus}', saved['mnemonic'])
        self.assertEqual(saved['provenance']['source'], '訪談筆記')
        self.assertEqual(self.submit('same-request', '請放進莊園', dict(reversed(list(capture.items())))), job_id)
        self.assertEqual(self.request('POST', '/api/chat', {'request_id': 'same-request', 'message': '另一句'})[0], 400)
        self.assertEqual(len(self.inputs), 1)

        self.outputs.append(answer(memories=[extracted(quote)]))
        duplicate = self.wait(self.submit('duplicate', quote))['result']
        self.assertEqual(duplicate['duplicates'][0]['id'], saved['id'])
        self.assertEqual(duplicate['memories'], [])

        self.outputs.append(answer('recall', recall_ids=[saved['id'], 'invented-id']))
        recalled = self.wait(self.submit('recall', '桂花何時開花？'))['result']
        self.assertEqual([memory['id'] for memory in recalled['retrieved']], [saved['id']])
        self.assertIn(saved['id'], {memory['id'] for memory in self.inputs[-1]['relevant_memories']})
        status, history = self.request('GET', '/api/chat/history')
        self.assertEqual(status, 200)
        self.assertEqual(history['conversation_id'], 'palace')
        self.assertEqual(history['messages'][0]['capture'], capture)
        self.assertEqual(history['messages'][1]['job_id'], job_id)
        self.assertEqual(history['messages'][1]['result']['memories'][0]['id'], saved['id'])
        self.assertEqual(len(PalaceStore(self.db).list()), 1)

    def test_full_room_persists_inbox_without_overwriting(self):
        store = PalaceStore(self.db)
        for locus in LOCI['garden']:
            store.add({'title': locus, 'body': '佔位測試', 'room_id': 'garden', 'locus_id': locus})
        quote = '桂花在十月開花'
        self.outputs.append(answer(memories=[extracted(quote)]))
        result = self.wait(self.submit('full-room', quote))['result']
        self.assertEqual(result['memories'], [])
        pending, = result['pending']
        self.assertEqual(pending['source_quote'], quote)
        self.assertEqual(self.request('GET', '/api/inbox')[1]['pending'], [pending])
        self.assertEqual(len(store.list(room='garden')), len(LOCI['garden']))

    def test_clicked_anchor_is_used_for_first_new_grounded_memory(self):
        placement = {'room_id': 'hall', 'locus_id': LOCI['hall'][1]}
        opening = '想聊聊今天'
        self.outputs.append(answer('chat', reply='今天哪件小事最值得留住？'))
        first = self.wait(self.submit('guided-opening', opening, placement=placement))['result']
        self.assertEqual(first['memories'], [])

        first_quote, second_quote = '桂花在十月開花', '綠豆在早上煮熟了'
        self.outputs.append(answer(memories=[
            extracted(placement['locus_id']),
            extracted(first_quote, mnemonic='想像桂花像煙火一樣綻放'),
            extracted(second_quote),
        ]))
        reply = self.wait(self.submit('guided-memory', first_quote + '。' + second_quote, placement=placement))['result']
        first, second = reply['memories']
        self.assertEqual((first['room_id'], first['locus_id']), (placement['room_id'], placement['locus_id']))
        self.assertEqual(first['source_quote'], first_quote)
        self.assertNotIn('{locus}', first['mnemonic'])
        self.assertEqual((second['room_id'], second['locus_id']), ('garden', LOCI['garden'][0]))
        self.assertEqual(self.inputs[-1]['placement'], placement)
        self.assertEqual(self.inputs[-1]['messages'][-1]['content'], '今天哪件小事最值得留住？')
        self.assertEqual(self.request('GET', '/api/chat/history')[1]['messages'][0]['placement'], placement)

    def test_occupied_clicked_anchor_is_pending_even_with_free_alternatives(self):
        store = PalaceStore(self.db)
        placement = {'room_id': 'hall', 'locus_id': LOCI['hall'][1]}
        existing = store.add({'title': '既有記憶', 'body': '仍在錨點', **placement})
        quote = '桂花在十月開花'
        self.outputs.append(AwaitingAPI())
        job_id = self.submit('wait-with-placement', quote, placement=placement)
        self.wait(job_id, 'awaiting_api')
        self.assertEqual(self.request('GET', '/api/inbox')[1]['awaiting_api'][0]['placement'], placement)
        self.outputs.append(answer(memories=[extracted(quote)]))
        self.assertEqual(self.request('POST', f'/api/jobs/{job_id}/retry')[0], 202)
        reply = self.wait(job_id)['result']
        self.assertEqual(reply['memories'], [])
        pending, = reply['pending']
        self.assertEqual((pending['room_id'], pending['locus_id']), (placement['room_id'], placement['locus_id']))
        self.assertEqual(pending['reason'], '你指定的錨點已有記憶。')
        self.assertEqual(store.list(), [existing])

    def test_invalid_clicked_anchor_is_rejected_before_submission(self):
        for placement in ({'room_id': 'hall', 'locus_id': LOCI['garden'][0]}, {'room_id': ['hall'], 'locus_id': ''},
                          {'room_id': 'hall'}, {'room_id': 'hall', 'locus_id': LOCI['hall'][0], 'extra': 1}, None):
            with self.subTest(placement=placement):
                status, response = self.request('POST', '/api/chat',
                                                {'request_id': 'invalid-placement', 'message': '你好', 'placement': placement})
                self.assertEqual(status, 400, response)
        self.assertEqual(self.inputs, [])

    def test_unconfigured_retains_capture_and_same_job_can_retry(self):
        quote = '桂花在十月開花'
        self.outputs.append(AwaitingAPI())
        job_id = self.submit('unconfigured', capture={'text': quote, 'source': '貼上對話'})
        self.assertNotIn('result', self.wait(job_id, 'awaiting_api'))
        inbox = self.request('GET', '/api/inbox')[1]
        entry, = inbox['awaiting_api']
        self.assertEqual(entry['job_id'], job_id)
        self.assertEqual(entry['capture']['text'], quote)
        self.assertEqual(PalaceStore(self.db).list(), [])

        self.outputs.append(answer(memories=[extracted(quote)]))
        self.assertEqual(self.request('POST', f'/api/jobs/{job_id}/retry'), (202, {'job_id': job_id}))
        self.assertEqual(self.wait(job_id)['result']['memories'][0]['source_quote'], quote)
        self.assertEqual(self.request('GET', '/api/inbox')[1]['awaiting_api'], [])

    def test_restart_recovers_interrupted_job_from_disk(self):
        with tempfile.TemporaryDirectory() as folder:
            db = Path(folder) / 'interrupted.sqlite3'
            original = AIButler(PalaceStore(db))
            quote = '桂花在十月開花'
            job_id = original.submit({'request_id': 'interrupted', 'message': quote})
            with original.store.connect() as conn:
                conn.execute("UPDATE ai_jobs SET status='running' WHERE id=?", (job_id,))
            self.outputs.append(answer(memories=[extracted(quote)]))
            restarted = AIButler(PalaceStore(db), self.infer)
            restarted.start()
            try:
                deadline = time.monotonic() + 5
                while time.monotonic() < deadline and restarted.job(job_id)['status'] != 'completed':
                    time.sleep(0.01)
                saved, = restarted.job(job_id)['result']['memories']
                self.assertEqual(saved['source_quote'], quote)
                self.assertEqual(len(restarted.store.list()), 1)
            finally:
                restarted.close()
                restarted.worker.join(timeout=1)

    def test_unverified_image_claim_never_becomes_memory(self):
        image = 'data:image/png;base64,' + base64.b64encode(
            b'\x89PNG\r\n\x1a\n test signature payload').decode()
        quote = '桂花在十月開花'
        self.outputs.append(answer(memories=[extracted(quote)], observed_image_text=quote))
        job_id = self.submit('unverified-image', '記下截圖', {'image_data_url': image})
        result = self.wait(job_id)['result']
        self.assertEqual(result['memories'], [])
        self.assertIn('可核對', result['reply'])
        history = self.request('GET', '/api/chat/history')[1]['messages']
        self.assertEqual(history[0]['capture'], {'has_image': True})

        self.outputs.append(answer(memories=[extracted(quote)], _verified_image_text=quote))
        verified = self.wait(self.submit('verified-image', '記下截圖', {'image_data_url': image}))['result']
        self.assertEqual(verified['observed_image_text'], quote)
        self.assertEqual(verified['memories'][0]['provenance']['kind'], 'image_text')
        self.assertEqual(self.inputs[-1]['capture']['image_data_url'], image)

    def test_failed_job_keeps_user_text_and_reports_no_fake_reply(self):
        self.outputs.append(RuntimeError('sensitive error'))
        job_id = self.submit('fail', '使用者要保留的內容')
        job = self.wait(job_id, 'failed')
        self.assertNotIn('sensitive error', job['error'])
        self.assertNotIn('result', job)
        history, = self.request('GET', '/api/chat/history')[1]['messages']
        self.assertEqual(history['content'], '使用者要保留的內容')
        self.assertEqual(history['status'], 'failed')


if __name__ == '__main__':
    unittest.main()
