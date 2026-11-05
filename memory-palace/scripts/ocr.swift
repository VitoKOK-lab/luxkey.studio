import Foundation
import Vision
import ImageIO

guard CommandLine.arguments.count == 2 else { exit(2) }
let imageURL = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
do {
    let supported = try request.supportedRecognitionLanguages()
    request.recognitionLanguages = ["zh-Hant", "zh-Hans", "en-US"].filter { supported.contains($0) }
    let handler = VNImageRequestHandler(url: imageURL, options: [:])
    try handler.perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    let output = try JSONSerialization.data(withJSONObject: ["text": text])
    FileHandle.standardOutput.write(output)
} catch {
    let failure = error as NSError
    FileHandle.standardError.write(Data("Image text recognition failed: \(failure.domain) \(failure.code) \(failure.localizedDescription)\n".utf8))
    exit(1)
}
