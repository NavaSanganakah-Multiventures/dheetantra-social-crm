package com.navasanganakah.dheetantra.plivo

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.plivo.endpoint.Endpoint
import com.plivo.endpoint.EventListener
import com.plivo.endpoint.Incoming
import com.plivo.endpoint.Outgoing

/**
 * Plivo official Android SDK (com.plivo.endpoint:endpoint) ka single owner.
 *
 *  - Endpoint ko init/login/logout karta hai
 *  - Incoming/Outgoing call objects rakhta hai
 *  - SDK ke EventListener events ko Flutter tak bhejta hai (PlivoChannel ke through)
 *
 * NOTE: SDK ka ek Endpoint ek time par sirf 1 call handle karta hai.
 */
class PlivoManager private constructor() : EventListener {

    companion object {
        /** PlivoIncomingCallActivity ko band karne ke liye local broadcast. */
        const val ACTION_INCOMING_ENDED = "com.navasanganakah.dheetantra.plivo.ACTION_INCOMING_ENDED"

        @Volatile
        private var INSTANCE: PlivoManager? = null

        fun get(): PlivoManager = INSTANCE ?: synchronized(this) {
            INSTANCE ?: PlivoManager().also { INSTANCE = it }
        }
    }

    var endpoint: Endpoint? = null
        private set

    var currentIncoming: Incoming? = null
        private set

    var currentOutgoing: Outgoing? = null
        private set

    /** Flutter ko events bhejne ka hook - PlivoChannel register karte waqt set hota hai. */
    var eventSink: ((event: String, data: Map<String, Any?>) -> Unit)? = null

    private val mainHandler = Handler(Looper.getMainLooper())

    private var appContext: Context? = null
    private var lastUsername: String? = null
    private var lastPassword: String? = null
    private var lastCertificateId: String? = null

    /** Native incoming UI ko caller info dene ke liye. */
    private var lastIncomingCaller: String? = null
    private var lastIncomingSip: String? = null

    fun ensureInitialized(context: Context): Boolean {
        if (endpoint != null) return true

        appContext = context.applicationContext

        val options = HashMap<String, Any>()
        options["context"] = context.applicationContext
        options["enableTracking"] = true

        endpoint = Endpoint.newInstance(true, this, options)
        return endpoint != null
    }

    fun login(username: String, password: String, fcmToken: String?, certificateId: String?): Boolean {
        val ep = endpoint ?: return false

        // SDK login() deviceToken=null par fail karta hai, isliye empty string pass karo.
        val token = fcmToken ?: ""
        val cert = certificateId ?: ""

        val ok = ep.login(username, password, token, cert)
        if (ok) {
            lastUsername = username
            lastPassword = password
            lastCertificateId = cert
        }
        return ok
    }

    fun reloginWithStoredCredentials(fcmToken: String?): Boolean {
        val u = lastUsername ?: return false
        val p = lastPassword ?: return false
        return login(u, p, fcmToken, lastCertificateId)
    }

    fun logout(): Boolean = endpoint?.logout() ?: false

    /** FCM/Plivo push headers ko SDK tak pahunchao (killed-state wake path). */
    fun relayPush(data: Map<String, String>) {
        endpoint?.relayVoipPushNotification(HashMap(data))
    }

    fun makeCall(destination: String): Boolean {
        val ep = endpoint ?: return false
        if (!ep.getRegistered()) return false

        val outgoing = ep.createOutgoingCall() ?: return false
        currentOutgoing = outgoing
        return outgoing.call(destination)
    }

    fun answer(): Boolean = currentIncoming?.answer() ?: false
    fun reject(): Boolean = currentIncoming?.reject() ?: false

    fun hangup() {
        currentIncoming?.hangup()
        currentOutgoing?.hangup()
        clearCurrentCall()
    }

    fun mute(): Boolean = currentIncoming?.mute() ?: currentOutgoing?.mute() ?: false
    fun unmute(): Boolean = currentIncoming?.unmute() ?: currentOutgoing?.unmute() ?: false
    fun sendDigits(digits: String): Boolean =
        currentIncoming?.sendDigits(digits) ?: currentOutgoing?.sendDigits(digits) ?: false

    fun isLoggedIn(): Boolean = endpoint?.getRegistered() ?: false

    fun clearCurrentCall() {
        currentIncoming = null
        currentOutgoing = null
    }

    /** Native incoming UI ke liye caller display name. */
    fun incomingCallerName(): String {
        return lastIncomingCaller?.takeIf { it.isNotBlank() } ?: "Incoming call"
    }

    /** Native incoming UI ke liye caller number/SIP. */
    fun incomingCallerNumber(): String {
        return lastIncomingSip ?: ""
    }

    private fun launchIncomingActivity() {
        val ctx = appContext ?: return
        mainHandler.post {
            try {
                val intent = Intent(ctx, PlivoIncomingCallActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_CLEAR_TOP or
                            Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS,
                    )
                }
                ctx.startActivity(intent)
            } catch (e: Exception) {
                // Lock screen / background launch restrictions par fail ho sakta hai.
            }
        }
    }

    private fun notifyIncomingEnded() {
        val ctx = appContext ?: return
        mainHandler.post {
            try {
                ctx.sendBroadcast(Intent(ACTION_INCOMING_ENDED).setPackage(ctx.packageName))
            } catch (e: Exception) {
                // ignore
            }
        }
    }

    private fun emit(event: String, data: Map<String, Any?> = emptyMap()) {
        eventSink?.invoke(event, data)
    }

    // ---------------- EventListener (SDK -> app) ----------------

    override fun onLogin() {
        emit("onLogin")
    }

    override fun onLogout() {
        emit("onLogout")
    }

    override fun onLoginFailed() {
        emit("onLoginFailed")
    }

    override fun onIncomingCall(incoming: Incoming) {
        currentIncoming = incoming
        lastIncomingCaller = incoming.getFromContact()
        lastIncomingSip = incoming.getFromSip()
        emit(
            "onIncomingCall",
            mapOf(
                "callId" to incoming.getCallId(),
                "from" to incoming.getFromContact(),
                "fromSip" to incoming.getFromSip(),
                "toSip" to incoming.getToSip(),
                "headers" to (try {
                    incoming.getHeaderDict()
                } catch (e: Exception) {
                    emptyMap<String, String>()
                }),
            ),
        )
        launchIncomingActivity()
    }

    override fun onIncomingCallHangup(incoming: Incoming) {
        currentIncoming = null
        emit("onIncomingCallHangup", mapOf("callId" to incoming.getCallId()))
        notifyIncomingEnded()
    }

    override fun onIncomingCallRejected(incoming: Incoming) {
        currentIncoming = null
        emit("onIncomingCallRejected", mapOf("callId" to incoming.getCallId()))
        notifyIncomingEnded()
    }

    override fun onIncomingCallInvalid(incoming: Incoming) {
        currentIncoming = null
        emit("onIncomingCallInvalid", mapOf("callId" to incoming.getCallId()))
        notifyIncomingEnded()
    }

    override fun onOutgoingCall(outgoing: Outgoing) {
        currentOutgoing = outgoing
        emit("onOutgoingCall", mapOf("callId" to outgoing.getCallId()))
    }

    override fun onOutgoingCallRinging(outgoing: Outgoing) {
        emit("onOutgoingCallRinging", mapOf("callId" to outgoing.getCallId()))
    }

    override fun onOutgoingCallAnswered(outgoing: Outgoing) {
        emit("onOutgoingCallAnswered", mapOf("callId" to outgoing.getCallId()))
    }

    override fun onOutgoingCallRejected(outgoing: Outgoing) {
        currentOutgoing = null
        emit("onOutgoingCallRejected", mapOf("callId" to outgoing.getCallId()))
    }

    override fun onOutgoingCallHangup(outgoing: Outgoing) {
        currentOutgoing = null
        emit("onOutgoingCallHangup", mapOf("callId" to outgoing.getCallId()))
    }

    override fun onOutgoingCallInvalid(outgoing: Outgoing) {
        currentOutgoing = null
        emit("onOutgoingCallInvalid", mapOf("callId" to outgoing.getCallId()))
    }

    override fun onIncomingDigitNotification(digit: String) {
        emit("onIncomingDigit", mapOf("digit" to digit))
    }

    override fun mediaMetrics(message: HashMap<*, *>) {
        emit("onMediaMetrics", mapOf("metrics" to message))
    }
}
