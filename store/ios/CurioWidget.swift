//  CurioWidget.swift
//  Two home-screen widgets, plus watch complications.
//
//  Widgets cannot be built with web technology on any platform — this is the
//  native half. The web app publishes a small JSON snapshot (see
//  publishWidgetSnapshot in app.js); the shell writes it into the App Group;
//  these widgets read it. No network, ever.
//
//  Setup:
//    1. Xcode → File → New → Target → Widget Extension, name "CurioWidget".
//    2. Add App Group "group.app.curio.diary" to BOTH the app and the widget.
//    3. Drop this file into the widget target.

import WidgetKit
import SwiftUI

// MARK: - the snapshot the web app publishes

struct CurioSnapshot: Codable {
    struct History: Codable { let year: Int; let text: String; let tag: String; let yearsAgo: Int }
    struct Diary: Codable {
        struct Memory: Codable { let title: String; let placard: String; let yearsAgo: Int }
        let title: String?; let placard: String?
        let kept: Int; let streak: Int
        let onThisDay: Memory?
    }
    let v: Int
    let generated: String
    let locale: String
    let history: History?
    let diary: Diary
}

enum SnapshotStore {
    static let appGroup = "group.app.curio.diary"
    static let key = "widgetSnapshot"

    static func load() -> CurioSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let json = defaults.string(forKey: key),
              let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(CurioSnapshot.self, from: data)
    }

    /// Called from the app shell when the web app publishes a new snapshot.
    static func save(_ json: String) {
        UserDefaults(suiteName: appGroup)?.set(json, forKey: key)
        WidgetCenter.shared.reloadAllTimelines()
    }
}

// MARK: - palette, matching the app exactly

enum Palette {
    static let dusk   = Color(red: 0.114, green: 0.102, blue: 0.169)
    static let dusk2  = Color(red: 0.145, green: 0.129, blue: 0.208)
    static let ivory  = Color(red: 0.949, green: 0.922, blue: 0.859)
    static let brass  = Color(red: 0.788, green: 0.635, blue: 0.294)
    static let slate  = Color(red: 0.490, green: 0.537, blue: 0.659)
    static let ink    = Color(red: 0.165, green: 0.129, blue: 0.094)
}

// MARK: - timeline

struct CurioEntry: TimelineEntry {
    let date: Date
    let snapshot: CurioSnapshot?
}

struct CurioProvider: TimelineProvider {
    func placeholder(in context: Context) -> CurioEntry { CurioEntry(date: Date(), snapshot: nil) }

    func getSnapshot(in context: Context, completion: @escaping (CurioEntry) -> Void) {
        completion(CurioEntry(date: Date(), snapshot: SnapshotStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CurioEntry>) -> Void) {
        let entry = CurioEntry(date: Date(), snapshot: SnapshotStore.load())
        // refresh just after midnight, when both the diary day and history roll over
        let midnight = Calendar.current.startOfDay(for: Date().addingTimeInterval(86_400))
        completion(Timeline(entries: [entry], policy: .after(midnight)))
    }
}

// MARK: - widget 1: your day

struct TodayWidgetView: View {
    var entry: CurioEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text("CURIO").font(.system(size: 9, weight: .bold, design: .monospaced))
                    .foregroundColor(Palette.brass).kerning(1.6)
                Spacer()
                if let s = entry.snapshot?.diary.streak, s > 0 {
                    Text("\(s)d").font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundColor(Palette.brass.opacity(0.85))
                }
            }

            if let d = entry.snapshot?.diary, let title = d.title {
                Text(title)
                    .font(.system(size: 17, weight: .medium, design: .serif))
                    .foregroundColor(Palette.ivory)
                    .lineLimit(2)
                if let placard = d.placard {
                    Text(placard)
                        .font(.system(size: 12, design: .serif))
                        .foregroundColor(Palette.ivory.opacity(0.66))
                        .lineLimit(3)
                }
                Spacer(minLength: 0)
                Text(d.kept == 0 ? "Nothing kept yet" : "\(d.kept) kept today")
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(Palette.ivory.opacity(0.4)).kerning(0.8)
            } else {
                Spacer()
                Text("Open Curio to keep the first thing.")
                    .font(.system(size: 13, design: .serif))
                    .foregroundColor(Palette.ivory.opacity(0.6))
                Spacer()
            }
        }
        .padding(14)
        .containerBackground(for: .widget) {
            LinearGradient(colors: [Palette.dusk2, Palette.dusk],
                           startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

struct CurioTodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CurioToday", provider: CurioProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your day so far, and how long the streak has run.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// MARK: - widget 2: today in history

struct HistoryWidgetView: View {
    var entry: CurioEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("TODAY IN HISTORY")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundColor(Palette.slate).kerning(1.6)

            if let h = entry.snapshot?.history {
                HStack(alignment: .firstTextBaseline, spacing: 7) {
                    Text(String(h.year))
                        .font(.system(size: 20, weight: .bold, design: .monospaced))
                        .foregroundColor(Palette.ivory)
                    Text("\(h.yearsAgo) years ago")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundColor(Palette.ivory.opacity(0.38)).kerning(0.8)
                }
                Text(h.text)
                    .font(.system(size: 13, design: .serif))
                    .foregroundColor(Palette.ivory.opacity(0.82))
                    .lineLimit(4)
                Spacer(minLength: 0)
                Text(h.tag.uppercased())
                    .font(.system(size: 8, weight: .bold, design: .monospaced))
                    .foregroundColor(Palette.ivory.opacity(0.9)).kerning(1)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(Palette.slate.opacity(0.85))
                    .clipShape(Capsule())
            } else {
                Spacer()
                Text("Open Curio once to load the almanac.")
                    .font(.system(size: 12, design: .serif))
                    .foregroundColor(Palette.ivory.opacity(0.55))
                Spacer()
            }
        }
        .padding(14)
        .containerBackground(for: .widget) {
            ZStack {
                LinearGradient(colors: [Palette.dusk2, Palette.dusk],
                               startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [Palette.slate.opacity(0.18), .clear],
                               center: .topTrailing, startRadius: 4, endRadius: 190)
            }
        }
    }
}

struct CurioHistoryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "CurioHistory", provider: CurioProvider()) { entry in
            HistoryWidgetView(entry: entry)
        }
        .configurationDisplayName("Today in History")
        .description("One thing the world was doing on this date.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge,
                            .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - bundle

@main
struct CurioWidgets: WidgetBundle {
    var body: some Widget {
        CurioTodayWidget()
        CurioHistoryWidget()
    }
}
