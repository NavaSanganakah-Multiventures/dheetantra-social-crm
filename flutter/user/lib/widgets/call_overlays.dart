import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import '../services/webrtc_service.dart';
import '../services/websocket_service.dart';
import '../theme/app_theme.dart';
import 'common.dart';

class GlobalCallOverlay extends StatefulWidget {
  final Widget child;

  const GlobalCallOverlay({super.key, required this.child});

  @override
  State<GlobalCallOverlay> createState() => _GlobalCallOverlayState();
}

class _GlobalCallOverlayState extends State<GlobalCallOverlay> {
  Map<String, dynamic>? _incomingCall;
  Map<String, dynamic>? _activeCall;
  String _callStatus = 'idle';
  int _callDuration = 0;
  Timer? _durationTimer;
  RTCVideoRenderer? _audioRenderer;
  bool _isMuted = false;

  late StreamSubscription _wsIncomingSub;
  late StreamSubscription _wsStatusSub;
  late StreamSubscription _rtcStatusSub;
  late StreamSubscription _rtcRemoteStreamSub;

  @override
  void initState() {
    super.initState();
    _initAudioRenderer();
    WebSocketService().connect();

    _wsIncomingSub = WebSocketService().onIncomingCall.listen((callData) {
      // Outgoing calls we start ourselves also come back over the same channel
      // (callRoutes broadcasts `incoming_call` to every socket) — never show
      // an "incoming" overlay for a call this device initiated.
      final direction = callData['direction'] ?? 'incoming';
      if (direction == 'outgoing' || direction == 'BUSINESS_INITIATED') return;
      if (_callStatus == 'idle') {
        setState(() {
          _incomingCall = callData;
          _callStatus = 'ringing';
        });
      }
    });

    _wsStatusSub = WebSocketService().onCallStatusUpdated.listen((data) {
      if (_activeCall != null && _activeCall!['id'] == data['call_id']) {
        if (data['status'] == 'completed' || data['status'] == 'ended' || data['status'] == 'declined') {
          _endCallCleanup();
        }
      } else if (_incomingCall != null && _incomingCall!['id'] == data['call_id']) {
        if (data['status'] == 'completed' || data['status'] == 'ended' || data['status'] == 'declined') {
          setState(() {
            _incomingCall = null;
            _callStatus = 'idle';
          });
        }
      }
    });

    _rtcStatusSub = WebRTCService().onCallState.listen((state) {
      setState(() {
        if (state == 'connecting') {
          _callStatus = 'connecting';
        } else if (state == 'connected') {
          _callStatus = 'connected';
          _startDurationTimer();
        } else if (state == 'ended' || state == 'error') {
          _endCallCleanup();
        }
      });
    });

    _rtcRemoteStreamSub = WebRTCService().onRemoteStream.listen((stream) {
      if (stream != null && _audioRenderer != null) {
        _audioRenderer!.srcObject = stream;
      }
    });
  }

  Future<void> _initAudioRenderer() async {
    _audioRenderer = RTCVideoRenderer();
    await _audioRenderer!.initialize();
  }

  @override
  void dispose() {
    _wsIncomingSub.cancel();
    _wsStatusSub.cancel();
    _rtcStatusSub.cancel();
    _rtcRemoteStreamSub.cancel();
    _durationTimer?.cancel();
    _audioRenderer?.dispose();
    super.dispose();
  }

  void _startDurationTimer() {
    _callDuration = 0;
    _durationTimer?.cancel();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _callDuration++;
      });
    });
  }

  void _endCallCleanup() {
    _durationTimer?.cancel();
    _audioRenderer?.srcObject = null;
    WebRTCService().cleanup();
    setState(() {
      _incomingCall = null;
      _activeCall = null;
      _callStatus = 'idle';
      _callDuration = 0;
      _isMuted = false;
    });
  }

  Future<void> _acceptCall() async {
    final callData = _incomingCall;
    if (callData == null) return;
    
    setState(() {
      _activeCall = callData;
      _incomingCall = null;
    });

    await WebRTCService().answerCall(callData);
  }

  Future<void> _rejectCall() async {
    final callData = _incomingCall;
    if (callData != null) {
      await WebRTCService().rejectCall(callData);
    }
    setState(() {
      _incomingCall = null;
      _callStatus = 'idle';
    });
  }

  Future<void> _hangup() async {
    final callData = _activeCall;
    if (callData != null) {
      await WebRTCService().hangup(callData);
    }
    _endCallCleanup();
  }

  void _toggleMute() {
    WebRTCService().toggleMute();
    setState(() {
      _isMuted = WebRTCService().isMuted;
    });
  }

  String _formatDuration(int seconds) {
    final mins = (seconds / 60).floor();
    final secs = seconds % 60;
    return '${mins.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        widget.child,

        // Incoming Call Overlay
        if (_incomingCall != null)
          Positioned(
            top: 40,
            left: 20,
            right: 20,
            child: Material(
              color: Colors.transparent,
              child: _buildIncomingCallDialog(),
            ),
          ),

        // Active Call Overlay
        if (_activeCall != null)
          Positioned(
            bottom: 20,
            left: 20,
            right: 20,
            child: Material(
              color: Colors.transparent,
              child: _buildActiveCallPanel(),
            ),
          ),
      ],
    );
  }

  Widget _buildIncomingCallDialog() {
    final name = _incomingCall!['contact_name'] ?? 'अज्ञात';
    final phone = _incomingCall!['phone'] ?? '';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 20,
            offset: const Offset(0, 10),
          )
        ],
      ),
      child: Row(
        children: [
          Avatar(name: name, size: 50),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  phone,
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'इनकमिंग कॉल...',
                  style: TextStyle(
                    color: AppColors.whatsapp,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                onTap: _rejectCall,
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: AppColors.danger,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.call_end_rounded, color: Colors.white),
                ),
              ),
              const SizedBox(width: 12),
              GestureDetector(
                onTap: _acceptCall,
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: AppColors.success,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.call_rounded, color: Colors.white),
                ),
              ),
            ],
          )
        ],
      ),
    );
  }

  Widget _buildActiveCallPanel() {
    final name = _activeCall!['contact_name'] ?? 'अज्ञात';

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surfaceAlt,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.5),
            blurRadius: 20,
            offset: const Offset(0, -10),
          )
        ],
      ),
      child: Row(
        children: [
          Avatar(name: name, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  _callStatus == 'connecting' ? 'कनेक्ट हो रहा है...' : _formatDuration(_callDuration),
                  style: TextStyle(
                    color: _callStatus == 'connecting' ? AppColors.textMuted : AppColors.success,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                onPressed: _toggleMute,
                icon: Icon(
                  _isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                  color: _isMuted ? AppColors.danger : Colors.white,
                ),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.surface,
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: _hangup,
                icon: const Icon(Icons.call_end_rounded, color: Colors.white),
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.danger,
                ),
              ),
            ],
          )
        ],
      ),
    );
  }
}
