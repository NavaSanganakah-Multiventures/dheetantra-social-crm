import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/callkit_service.dart';
import '../services/webrtc_service.dart';
import '../services/websocket_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';

/// Alag full-screen call screen jo call attend hone par dikhna chahiye.
/// Screen mute, speaker/earpiece switch, hangup aur call duration control karti hai.
class CallScreen extends StatefulWidget {
  final Map<String, dynamic> callData;

  const CallScreen({super.key, required this.callData});

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  String _status = 'connecting';
  int _duration = 0;
  Timer? _durationTimer;

  StreamSubscription? _rtcStateSub;
  StreamSubscription? _wsStatusSub;

  @override
  void initState() {
    super.initState();
    _rtcStateSub = WebRTCService().onCallState.listen(_onCallState);
    _wsStatusSub = WebSocketService().onCallStatusUpdated.listen(_onCallStatus);
  }

  void _onCallState(String state) {
    if (!mounted) return;
    setState(() {
      if (state == 'connected') {
        _status = 'connected';
        _startDurationTimer();
      } else if (state == 'connecting') {
        _status = 'connecting';
      } else if (state.startsWith('error')) {
        _status = state; // e.g. 'error: WebRTC SDP is missing...'
        // Do NOT auto-pop on error immediately so user can see it!
      } else if (state == 'ended') {
        _status = 'ended';
        _finishCall();
      }
    });
  }

  void _onCallStatus(Map<String, dynamic> data) {
    final callId = data['call_id']?.toString();
    final currentId = widget.callData['id']?.toString();
    if (callId == null || currentId == null || callId != currentId) return;

    final status = data['status']?.toString() ?? '';
    if (status == 'completed' || status == 'ended' || status == 'declined') {
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
    // 'ended' duplicate events (WebRTC watchdog + plugin Closed re-fire) se
    // double pop na ho — ek hi baar teardown chalega.
    if (_finishCalled) return;
    _finishCalled = true;
    _durationTimer?.cancel();
    // Registry + plugin native UI cleanup — warna same-id agli call
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

  Future<void> _hangup() async {
    await WebRTCService().hangup(widget.callData);
  }

  void _toggleMute() {
    WebRTCService().toggleMute();
    setState(() {});
  }

  Future<void> _toggleSpeaker() async {
    await WebRTCService().toggleSpeaker();
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
        'अज्ञात';
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
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final statusText = _status == 'connecting'
        ? 'संपर्क हो रहा है...'
        : _status.startsWith('error')
            ? _status.replaceFirst('error: Exception: ', 'Error: ')
            : _status == 'ended' 
                ? 'कॉल समाप्त'
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
                        icon: WebRTCService().isMuted
                            ? Icons.mic_off_rounded
                            : Icons.mic_rounded,
                        label: WebRTCService().isMuted ? 'म्यूट' : 'अनम्यूट',
                        color: WebRTCService().isMuted
                            ? AppColors.danger
                            : AppColors.surfaceAlt,
                        iconColor: WebRTCService().isMuted
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
                        icon: WebRTCService().isSpeakerOn
                            ? Icons.volume_up_rounded
                            : Icons.hearing_rounded,
                        label: WebRTCService().isSpeakerOn
                            ? 'स्पीकर'
                            : 'ईयरफोन',
                        color: WebRTCService().isSpeakerOn
                            ? AppColors.accent
                            : AppColors.surfaceAlt,
                        iconColor: WebRTCService().isSpeakerOn
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
