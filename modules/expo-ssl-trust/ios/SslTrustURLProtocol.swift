import Foundation
import Security

/// Custom URLProtocol that intercepts HTTPS requests and applies
/// our custom certificate trust evaluation for self-signed certs.
///
/// This integrates with React Native's NSURLSession-based networking
/// to allow connections to servers with trusted self-signed certificates.
class SslTrustURLProtocol: URLProtocol, URLSessionDataDelegate {
    
    private static let handledKey = "SslTrustURLProtocol_Handled"
    private var dataTask: URLSessionDataTask?
    private var urlSession: URLSession?
    private var receivedData: Data?
    private var receivedResponse: URLResponse?
    
    // MARK: - URLProtocol Methods
    
    override class func canInit(with request: URLRequest) -> Bool {
        // Only intercept HTTPS requests that haven't been handled already
        guard let url = request.url,
              url.scheme == "https",
              URLProtocol.property(forKey: handledKey, in: request) == nil else {
            return false
        }
        
        // Only intercept if the host has a trusted cert in our store
        guard let host = url.host else { return false }
        return SslTrustStore.shared.isCertificateTrusted(hostname: host)
    }
    
    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }
    
    override func startLoading() {
        // Mark this request as handled to prevent infinite loop.
        // U6 hygiene: NSURLRequest.mutableCopy() is contractually NSMutableURLRequest
        // but we replace the as!-cast with a guarded fallback so a misbehaving
        // bridged subclass cannot crash the URL loading thread.
        guard let mutableRequest = (request as NSURLRequest).mutableCopy() as? NSMutableURLRequest else {
            client?.urlProtocol(self, didFailWithError: NSError(
                domain: "expo.ssl.trust",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "Failed to create mutable request copy"]
            ))
            return
        }
        URLProtocol.setProperty(true, forKey: SslTrustURLProtocol.handledKey, in: mutableRequest)

        let config = URLSessionConfiguration.default
        urlSession = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        dataTask = urlSession?.dataTask(with: mutableRequest as URLRequest)
        dataTask?.resume()
    }
    
    override func stopLoading() {
        dataTask?.cancel()
        dataTask = nil
        urlSession?.invalidateAndCancel()
        urlSession = nil
    }
    
    // MARK: - URLSessionDataDelegate
    
    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge,
        completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
    ) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust,
              let host = request.url?.host else {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        
        // First try default system evaluation
        var error: CFError?
        let systemTrusted = SecTrustEvaluateWithError(serverTrust, &error)
        
        if systemTrusted {
            completionHandler(.performDefaultHandling, nil)
            return
        }
        
        // System doesn't trust it. Check our custom store.
        if SslTrustStore.shared.checkTrust(hostname: host, serverTrust: serverTrust) {
            let credential = URLCredential(trust: serverTrust)
            completionHandler(.useCredential, credential)
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
    
    func urlSession(
        _ session: URLSession,
        dataTask: URLSessionDataTask,
        didReceive response: URLResponse,
        completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
    ) {
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        completionHandler(.allow)
    }
    
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        client?.urlProtocol(self, didLoad: data)
    }
    
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            client?.urlProtocol(self, didFailWithError: error)
        } else {
            client?.urlProtocolDidFinishLoading(self)
        }
    }
}
