//  CurioApp.swift
//  A thin, honest native shell around the Curio web app.
//
//  Why a shell rather than a rewrite: the entire product — the composer, the
//  vault, the Recovery Kit encryption — is already local JavaScript that works
//  offline. Wrapping it gives three things the browser cannot:
//    1. App Store discovery
//    2. Storage that iOS will not evict after inactivity
//    3. A real app icon, splash and share-sheet target
//
//  The web assets are bundled in the app, so it works offline on first launch
//  with no network at all.

import SwiftUI
import WebKit

@main
struct CurioApp: App {
    var body: some Scene {
        WindowGroup {
            CurioWebView()
                .ignoresSafeArea()
                .preferredColorScheme(.dark)
                .persistentSystemOverlays(.hidden)
        }
    }
}

struct CurioWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        // A persistent data store: IndexedDB here is NOT subject to Safari's
        // seven-day eviction, which is the main reason to ship this shell.
        config.websiteDataStore = .default()

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.114, green: 0.102, blue: 0.169, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.scrollView.bounces = false
        web.allowsBackForwardNavigationGestures = false

        // Load the bundled copy — no network required, ever.
        if let root = Bundle.main.url(forResource: "app", withExtension: "html", subdirectory: "web") {
            web.loadFileURL(root, allowingReadAccessTo: root.deletingLastPathComponent())
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
