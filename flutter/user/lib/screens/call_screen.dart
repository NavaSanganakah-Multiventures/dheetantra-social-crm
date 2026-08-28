import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/callkit_service.dart';
import '../services/webrtc_service.dart';
import '../services/websocket_service.dart';
import '../services/twilio_voice_service.dart';
import '../services/plivo_voice_service.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import 'package:permission_handler/permission_handler.dart';
import '../widgets/common.dart';

/// Alag full-screen call screen jo call attend hone par dikhna chahiye.
/// Screen mute, speaker/earpiece switch, hangup aur call duration control karti hai.
class CallScreen extends StatefulWidget {
  final Map<String, dynamic> callData;

  const CallScreen({super.key, required this.callData});

  /// Call screen ko bina animation ke turant foreground par lao â incoming
  /// accept ke waqt HomeScreen ka flash nahi dikhna chahiye.
  static void push(BuildContext context, Map<String, dynamic> callData) {
    Navigator.of(context).push(
      PageRouteBuilder<void>(
        opaque: true,
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
        pageBuilder: (_, __, ___) => CallScreen(callData: callData),
      ),
    );
  }

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  String _status = 'connecting';
  int _duration = 0;
  Timer? _durationTimer;

  StreamSubscription? _rtcStateSub;
  StreamSubscription? _wsStatusSub;
  StreamSubscription? _twilioStateSub;
  StreamSubscription? _plivoStateSub;

  bool get _isTwilio => widget.callData['source']?.toString() == 'twilio' ||
      ((widget.callData['conferenceName']?.toString() ?? '').isNotEmpty &&
          widget.callData['source']?.toString() != 'plivo');

  bool get _isPlivo => widget.callData['source']?.toString() == 'plivo';

  bool get _muted => _isPlivo
      ? PlivoVoiceService().isMuted
      : (_isTwilio ? TwilioVoiceService().isMuted : WebRTCService().isMuted);

  bool get _speakerOn => _isPlivo
      ? PlivoVoiceService().isSpeakerOn
      : (_isTwilio ? TwilioVoiceService().isSpeakerOn : WebRTCService().isSpeakerOn);

  @override
  void initState() {
    super.initState();
    _rtcStateSub = WebRTCService().onCallState.listen(_onCallState);
    _wsStatusSub = WebSocketService().onCallStatusUpdated.listen(_onCallStatus);
    _twilioStateSub = TwilioVoiceService().onCallState.listen(_onCallState);
    _plivoStateSub = PlivoVoiceService().onCallState.listen(_onCallState);
    // Twilio and Plivo (in-app mode) answer via their own SDKs: request mic
    // permission and join the conference on accept. Plivo's legacy auto-dial
    // (PSTN bridge) mode has no conferenceName and is answered on the agent's
    // phone, so it must not auto-join in-app.
    if (_isTwilio ||
        (_isPlivo && (widget.callData['conferenceName']?.toString() ?? '').isNotEmpty)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _requestPermissionAndAnswer());
    } else if ((widget.callData['sdp']?.toString() ?? '').isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _requestPermissionAndAnswer());
    }
  }

  void _onCallState(String state) {
    debugPrint('[CallScreen] WebRTC state: $state');
    if (!mounted) return;
    setState(() {
      if (state == 'connected') {
        if (_status != 'connected') {
          _status = 'connected';
          _startDurationTimer();
        }
      } else if (state == 'connecting') {
        _status = 'connecting';
      } else if (state.startsWith('error')) {
        _status = state; // e.g. 'error: WebRTC SDP is missing...'
        // Do NOT auto-pop on error immediately so user can see it!
      } else if (state == 'ended') {
        // Twilio calls are bridged through the backend: the in-app SDK
        // 'ended' event is NOT the source of truth and can fire prematurely
        // while the customer leg is still ringing, so ignore it and let the
        // WebSocket call_status_updated event (or an explicit hangup) close
        // the screen. Plivo (Phase 2) uses our own SIP softphone whose
        // 'ended' event IS meaningful (BYE from the conference).
        if (_isTwilio) {
          debugPrint('[CallScreen] ignoring premature in-app ended for Twilio bridged call');
        } else {
          _status = 'ended';
          _finishCall();
        }
      }
    });
  }

  void _onCallStatus(Map<String, dynamic> data) {
    final callId = data['call_id']?.toString();
    final currentId = widget.callData['id']?.toString();
    debugPrint('[CallScreen] WS call status update: callId=$callId current=$currentId data=$data');
    if (callId == null || currentId == null || callId != currentId) return;

    final status = data['status']?.toString() ?? '';

    // Twilio/Plivo calls are bridged through the backend; the customer-leg
    // status can drive the connected timer (in-app SDK events are primary).
    if ((_isTwilio || _isPlivo) &&
        (status == 'in_progress' || status == 'answered' || status == 'connected')) {
      if (mounted && _status != 'connected') {
        setState(() {
          _status = 'connected';
          _startDurationTimer();
        });
      }
      return;
    }

    if (status == 'completed' || status == 'ended' || status == 'declined' || status == 'terminated' ||
        status == 'no_answer' || status == 'busy' || status == 'failed' || status == 'canceled') {
      debugPrint('[CallScreen] remote ended the call â finishing');
      _finishCall();
    }
  }

  void _startDurationTimer() {
    _durationTimer?.cancel();
    _duration = 0;
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() => _duration++);
      }
    });
  }

  bool _finishCalled = false;

  void _finishCall() {
    debugPrint('[CallScreen] _finishCall()');
    // 'ended' duplicate events (WebRTC watchdog + plugin Closed re-fire) se
    // double pop na ho â ek hi baar teardown chalega.
    if (_finishCalled) return;
    _finishCalled = true;
    _durationTimer?.cancel();
    // Registry + plugin native UI cleanup â warna same-id agli call
    // duplicate-guard se permanently block ho jayegi.
    CallKitService().handleCallEnded(
      widget.callData['id']?.toString() ??
          widget.callData['callId']?.toString() ??
          '',
    );
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  Future<void> _requestPermissionAndAnswer() async {
    debugPrint('[CallScreen] checking microphone permission');
    if (!mounted) return;

    if (_isTwilio || _isPlivo) {
      final status = await Permission.microphone.status;
      if (status.isGranted) {
        await _startAnswer();
        return;
      }
      if (status.isPermanentlyDenied) {
        _showMicPermissionDialog(permanent: true);
        return;
      }
      final result = await Permission.microphone.request();
      if (result.isGranted) {
        await _startAnswer();
      } else {
        _showMicPermissionDialog(permanent: result.isPermanentlyDenied);
      }
      return;
    }

    final status = await Permission.microphone.status;
    debugPrint('[CallScreen] microphone status: $status');
    if (status.isGranted) {
      await _startAnswer();
      return;
    }

    if (status.isPermanentlyDenied) {
      _showMicPermissionDialog(permanent: true);
      return;
    }

    final result = await Permission.microphone.request();
    debugPrint('[CallScreen] microphone request result: $result');
    if (result.isGranted) {
      await _startAnswer();
    } else if (result.isPermanentlyDenied) {
      _showMicPermissionDialog(permanent: true);
    } else {
      _showMicPermissionDialog(permanent: false);
    }
  }

  Future<void> _startAnswer() async {
    if (_isPlivo) {
      debugPrint('[CallScreen] joining Plivo conference');
      final conferenceName = widget.callData['conferenceName']?.toString() ??
          widget.callData['id']?.toString() ??
          widget.callData['callId']?.toString() ?? '';
      final ok = await PlivoVoiceService().joinConference(conferenceName);
      if (!ok && mounted) {
        setState(() => _status = 'error: Failed to connect Plivo call');
      }
      return;
    }
    if (_isTwilio) {
      debugPrint('[CallScreen] joining Twilio conference');
      final conferenceName = widget.callData['conferenceName']?.toString() ??
          widget.callData['id']?.toString() ??
          widget.callData['callId']?.toString() ?? '';
      final ok = await TwilioVoiceService().joinConference(
        conferenceName,
        callerName: _callerName,
      );
      if (!ok && mounted) {
        setState(() => _status = 'error: Failed to connect Twilio call');
      }
      return;
    }
    debugPrint('[CallScreen] starting WebRTC answer');
    try {
      await WebRTCService().answerCall(widget.callData);
    } catch (e) {
      debugPrint('[CallScreen] answerCall error: $e');
    }
  }

  void _showMicPermissionDialog({required bool permanent}) {
    if (!mounted) return;
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: const Text('à¤®à¤¾à¤à¤à¥à¤°à¥à¤«à¤¼à¥à¤¨ Permission à¤à¤¾à¤¹à¤¿à¤'),
        content: const Text('à¤à¥à¤² à¤à¤ à¤¾à¤¨à¥ à¤à¥ à¤²à¤¿à¤ à¤®à¤¾à¤à¤à¥à¤°à¥à¤«à¤¼à¥à¤¨ à¤à¥ à¤à¤¨à¥à¤®à¤¤à¤¿ à¤à¤¼à¤°à¥à¤°à¥ à¤¹à¥à¥¤'),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              // Sirf dialog band karein — CallScreen ko pop na karein. Call
              // pehle se place ho chuki hai; user ko error dikhe aur wo khud
              // hangup kar sake (warna UI flash hokar gayab ho jata hai).
              if (mounted) {
                setState(() => _status = 'error: Microphone permission denied');
              }
            },
            child: const Text('à¤¬à¤à¤¦ à¤à¤°à¥à¤'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              openAppSettings();
            },
            child: const Text('Settings à¤à¥à¤²à¥à¤'),
          ),
        ],
      ),
    );
  }

  Future<void> _hangup() async {
    if (_isPlivo) {
      final id = widget.callData['id']?.toString() ?? widget.callData['callId']?.toString() ?? '';
      await PlivoVoiceService().hangUp();
      await ApiService().hangupPlivoCall(id);
      _finishCall();
    } else if (_isTwilio) {
      await TwilioVoiceService().hangUp();
      // hangUp() sirf tab 'ended' emit karta hai jab SDK on-call ho. Har haal
      // mein screen band karo taaki call UI kabhi stuck na rahe.
      _finishCall();
    } else {
      await WebRTCService().hangup(widget.callData);
    }
  }

  void _toggleMute() {
    if (_isPlivo) {
      PlivoVoiceService().toggleMute();
    } else if (_isTwilio) {
      TwilioVoiceService().toggleMute();
    } else {
      WebRTCService().toggleMute();
    }
    setState(() {});
  }

  Future<void> _toggleSpeaker() async {
    if (_isPlivo) {
      await PlivoVoiceService().toggleSpeaker();
    } else if (_isTwilio) {
      await TwilioVoiceService().toggleSpeaker();
    } else {
      await WebRTCService().toggleSpeaker();
    }
    setState(() {});
  }

  String _formatDuration(int seconds) {
    final mins = (seconds / 60).floor();
    final secs = seconds % 60;
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  String get _callerName {
    return widget.callData['contact_name'] ??
        widget.callData['callerName'] ??
        'à¤à¤à¥à¤à¤¾à¤¤';
  }

  String get _callerPhone {
    return widget.callData['phone'] ??
        widget.callData['callerNumber'] ??
        widget.callData['handle']?.toString() ??
        '';
  }

  String get _callerEmail {
    return widget.callData['email'] ??
        widget.callData['contactEmail'] ??
        '';
  }

  String get _lastMessage {
    return widget.callData['lastMessage'] ?? '';
  }

  @override
  void dispose() {
    _durationTimer?.cancel();
    _rtcStateSub?.cancel();
    _wsStatusSub?.cancel();
    _twilioStateSub?.cancel();
    _plivoStateSub?.cancel();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final statusText = _status == 'connecting'
        ? 'à¤¸à¤à¤ªà¤°à¥à¤ à¤¹à¥ à¤°à¤¹à¤¾ à¤¹à¥...'
        : _status.startsWith('error')
            ? _status.replaceFirst('error: Exception: ', 'Error: ')
            : _status == 'ended' 
                ? 'à¤à¥à¤² à¤¸à¤®à¤¾à¤ªà¥à¤¤'
                : _formatDuration(_duration);

    return PopScope(
      canPop: false,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: AppColors.background,
          body: SafeArea(
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF18181B), AppColors.background],
                ),
              ),
              child: Column(
                children: [
                  const SizedBox(height: 60),
                  // Caller avatar
                  Avatar(name: _callerName, size: 120),
                  const SizedBox(height: 24),
                  Text(
                    _callerName,
                    style: const TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 28,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    _callerPhone,
                    style: const TextStyle(
                      color: AppColors.textSecondary,
                      fontSize: 16,
                    ),
                  ),
                  if (_callerEmail.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        _callerEmail,
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  if (_lastMessage.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 12, left: 32, right: 32),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: AppColors.surfaceAlt,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          _lastMessage,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      if (_status == 'connecting')
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(right: 8),
                          decoration: const BoxDecoration(
                            color: AppColors.success,
                            shape: BoxShape.circle,
                          ),
                        ),
                      Text(
                        statusText,
                        style: TextStyle(
                          color: _status == 'connected'
                              ? AppColors.success
                              : AppColors.textMuted,
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  // Call controls
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _CallButton(
                        icon: _muted
                            ? Icons.mic_off_rounded
                            : Icons.mic_rounded,
                        label: _muted ? 'म्यूट' : 'अनम्यूट',
                        color: _muted
                            ? AppColors.danger
                            : AppColors.surfaceAlt,
                        iconColor: _muted
                            ? Colors.white
                            : AppColors.textPrimary,
                        onTap: _toggleMute,
                      ),
                      const SizedBox(width: 24),
                      _CallButton(
                        icon: Icons.call_end_rounded,
                        label: 'कट करें',
                        color: AppColors.danger,
                        iconColor: Colors.white,
                        size: 74,
                        iconSize: 34,
                        onTap: _hangup,
                      ),
                      const SizedBox(width: 24),
                      _CallButton(
                        icon: _speakerOn
                            ? Icons.volume_up_rounded
                            : Icons.hearing_rounded,
                        label: _speakerOn ? 'स्पीकर' : 'ईयरफोन',
                        color: _speakerOn
                            ? AppColors.accent
                            : AppColors.surfaceAlt,
                        iconColor: _speakerOn
                            ? Colors.white
                            : AppColors.textPrimary,
                        onTap: _toggleSpeaker,
                      ),
                    ],
                  ),
const SizedBox(height: 60),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CallButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final Color iconColor;
  final double size;
  final double iconSize;
  final VoidCallback onTap;

  const _CallButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.iconColor,
    this.size = 64,
    this.iconSize = 28,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: onTap,
          child: Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: color.withValues(alpha: 0.35),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                )
              ],
            ),
            child: Icon(icon, color: iconColor, size: iconSize),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          label,
          style: TextStyle(
            color: iconColor,
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
