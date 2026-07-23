//  CurioWidget.kt
//  Home-screen widgets for Android, written with Jetpack Glance.
//
//  Same idea as iOS: the web app publishes a JSON snapshot, the shell stores it
//  in SharedPreferences, and these widgets read it. No network.
//
//  Setup:
//    dependencies { implementation "androidx.glance:glance-appwidget:1.1.0" }
//  Register both receivers in AndroidManifest.xml.

package app.curio.diary

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.*
import androidx.glance.appwidget.*
import androidx.glance.background
import androidx.glance.layout.*
import androidx.glance.text.*
import org.json.JSONObject

// ---- palette, matching the app ----
private val DUSK  = Color(0xFF1D1A2B)
private val DUSK2 = Color(0xFF252135)
private val IVORY = Color(0xFFF2EBDB)
private val BRASS = Color(0xFFC9A24B)
private val SLATE = Color(0xFF7D89A8)

// ---- the snapshot ----
object SnapshotStore {
    private const val PREFS = "curio_widget"
    private const val KEY = "snapshot"

    fun save(context: Context, json: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY, json).apply()
    }

    fun load(context: Context): JSONObject? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY, null)
            ?.let { runCatching { JSONObject(it) }.getOrNull() }
}

// ---- widget 1: your day ----
class CurioTodayWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = SnapshotStore.load(context)
        provideContent { TodayContent(snap) }
    }
}

@Composable
private fun TodayContent(snap: JSONObject?) {
    val diary = snap?.optJSONObject("diary")
    Column(
        modifier = GlanceModifier.fillMaxSize().background(DUSK).padding(14.dp)
    ) {
        Row(modifier = GlanceModifier.fillMaxWidth()) {
            Text("CURIO", style = TextStyle(color = ColorProvider(BRASS),
                fontSize = 9.sp, fontWeight = FontWeight.Bold))
            Spacer(GlanceModifier.defaultWeight())
            val streak = diary?.optInt("streak") ?: 0
            if (streak > 0) {
                Text("${streak}d", style = TextStyle(color = ColorProvider(BRASS), fontSize = 9.sp))
            }
        }
        Spacer(GlanceModifier.height(8.dp))
        Text(
            diary?.optString("title").takeUnless { it.isNullOrBlank() }
                ?: "Open Curio to keep the first thing.",
            style = TextStyle(color = ColorProvider(IVORY), fontSize = 16.sp,
                fontWeight = FontWeight.Medium),
            maxLines = 2
        )
        val placard = diary?.optString("placard")
        if (!placard.isNullOrBlank()) {
            Spacer(GlanceModifier.height(5.dp))
            Text(placard, style = TextStyle(color = ColorProvider(IVORY.copy(alpha = 0.66f)),
                fontSize = 12.sp), maxLines = 3)
        }
        Spacer(GlanceModifier.defaultWeight())
        val kept = diary?.optInt("kept") ?: 0
        Text(if (kept == 0) "NOTHING KEPT YET" else "$kept KEPT TODAY",
            style = TextStyle(color = ColorProvider(IVORY.copy(alpha = 0.4f)), fontSize = 9.sp))
    }
}

class CurioTodayReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CurioTodayWidget()
}

// ---- widget 2: today in history ----
class CurioHistoryWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snap = SnapshotStore.load(context)
        provideContent { HistoryContent(snap) }
    }
}

@Composable
private fun HistoryContent(snap: JSONObject?) {
    val h = snap?.optJSONObject("history")
    Column(
        modifier = GlanceModifier.fillMaxSize().background(DUSK2).padding(14.dp)
    ) {
        Text("TODAY IN HISTORY", style = TextStyle(color = ColorProvider(SLATE),
            fontSize = 9.sp, fontWeight = FontWeight.Bold))
        Spacer(GlanceModifier.height(8.dp))
        if (h != null) {
            Row {
                Text("${h.optInt("year")}", style = TextStyle(color = ColorProvider(IVORY),
                    fontSize = 19.sp, fontWeight = FontWeight.Bold))
                Spacer(GlanceModifier.width(7.dp))
                Text("${h.optInt("yearsAgo")} years ago",
                    style = TextStyle(color = ColorProvider(IVORY.copy(alpha = 0.38f)), fontSize = 9.sp))
            }
            Spacer(GlanceModifier.height(6.dp))
            Text(h.optString("text"),
                style = TextStyle(color = ColorProvider(IVORY.copy(alpha = 0.82f)), fontSize = 13.sp),
                maxLines = 4)
        } else {
            Text("Open Curio once to load the almanac.",
                style = TextStyle(color = ColorProvider(IVORY.copy(alpha = 0.55f)), fontSize = 12.sp))
        }
    }
}

class CurioHistoryReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = CurioHistoryWidget()
}

// ---- the bridge the WebView calls ----
//
//  In your WebView activity:
//
//      webView.addJavascriptInterface(CurioBridge(this), "CurioNative")
//
class CurioBridge(private val context: Context) {
    @android.webkit.JavascriptInterface
    fun publishWidget(json: String) {
        SnapshotStore.save(context, json)
        // ask Glance to redraw
        androidx.glance.appwidget.updateAll(context, CurioTodayWidget())
        androidx.glance.appwidget.updateAll(context, CurioHistoryWidget())
    }
}
