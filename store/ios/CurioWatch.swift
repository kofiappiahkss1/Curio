//  CurioWatch.swift
//  watchOS app + complications.
//
//  The watch does two things worth doing: shows what the day already holds,
//  and lets you keep a moment without taking the phone out. It reads the same
//  snapshot the widgets use, delivered over WatchConnectivity.
//
//  Setup: Xcode → File → New → Target → watchOS App, name "Curio Watch".

import SwiftUI
import WatchConnectivity
import WidgetKit

// MARK: - receiving the snapshot from the phone

final class WatchLink: NSObject, ObservableObject, WCSessionDelegate {
    @Published var snapshot: CurioSnapshot?
    static let shared = WatchLink()

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        snapshot = SnapshotStore.load()
    }

    func session(_ s: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {}

    func session(_ s: WCSession, didReceiveApplicationContext context: [String: Any]) {
        guard let json = context["snapshot"] as? String else { return }
        SnapshotStore.save(json)
        DispatchQueue.main.async {
            self.snapshot = SnapshotStore.load()
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// Ask the phone to open the capture sheet for a given kind.
    func keep(_ kind: String) {
        guard WCSession.default.isReachable else { return }
        WCSession.default.sendMessage(["keep": kind], replyHandler: nil, errorHandler: nil)
    }
}

// MARK: - the watch app

struct CurioWatchView: View {
    @StateObject private var link = WatchLink.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let d = link.snapshot?.diary {
                    Text(d.title ?? "Nothing kept yet")
                        .font(.system(size: 16, weight: .medium, design: .serif))
                        .foregroundColor(Palette.ivory)
                    HStack(spacing: 10) {
                        Label("\(d.kept)", systemImage: "square.stack")
                        if d.streak > 0 { Label("\(d.streak)d", systemImage: "flame") }
                    }
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundColor(Palette.brass)
                }

                Divider().background(Palette.ivory.opacity(0.15))

                Text("KEEP A MOMENT")
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(Palette.ivory.opacity(0.45)).kerning(1.4)

                HStack(spacing: 8) {
                    WatchKeepButton(icon: "mic.fill", kind: "voice", link: link)
                    WatchKeepButton(icon: "mappin", kind: "place", link: link)
                    WatchKeepButton(icon: "face.smiling", kind: "note", link: link)
                }

                if let h = link.snapshot?.history {
                    Divider().background(Palette.ivory.opacity(0.15))
                    Text("TODAY IN HISTORY")
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundColor(Palette.slate).kerning(1.4)
                    Text("\(String(h.year)) — \(h.text)")
                        .font(.system(size: 12, design: .serif))
                        .foregroundColor(Palette.ivory.opacity(0.78))
                }
            }
            .padding(.horizontal, 4)
        }
        .background(Palette.dusk.ignoresSafeArea())
    }
}

struct WatchKeepButton: View {
    let icon: String
    let kind: String
    let link: WatchLink

    var body: some View {
        Button { link.keep(kind) } label: {
            Image(systemName: icon)
                .font(.system(size: 15))
                .frame(maxWidth: .infinity, minHeight: 38)
        }
        .buttonStyle(.plain)
        .background(Palette.dusk2)
        .foregroundColor(Palette.brass)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

@main
struct CurioWatchApp: App {
    var body: some Scene {
        WindowGroup { CurioWatchView() }
    }
}

// MARK: - phone side (add to the iPhone target)
//
//  Send the snapshot to the watch whenever the web app publishes one:
//
//      func publish(_ json: String) {
//          SnapshotStore.save(json)
//          if WCSession.default.activationState == .activated {
//              try? WCSession.default.updateApplicationContext(["snapshot": json])
//          }
//      }
//
//  And bridge it from the web view. In CurioApp.swift's makeUIView:
//
//      config.userContentController.add(context.coordinator, name: "curioWidget")
//
//  with a coordinator implementing WKScriptMessageHandler that calls publish().
