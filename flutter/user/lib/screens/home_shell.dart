import 'dart:async';

import 'package:flutter/material.dart';

import '../models/models.dart' as models;
import '../services/api_service.dart';
import '../services/battery_optimization_service.dart';
import '../services/callkit_service.dart';
import '../services/data_refresh_service.dart';
import '../services/fcm_service.dart';
import '../services/foreground_service.dart';
import '../services/notification_center.dart';
import '../services/notification_router.dart';
import '../services/websocket_service.dart';
import '../services/webrtc_service.dart';
import '../theme/app_theme.dart';
import '../widgets/call_overlays.dart';
import '../widgets/responsive_layout.dart';
import 'broadcast_screen.dart';
import 'call_screen.dart';
import 'chat_screen.dart';
import 'contacts_screen.dart';
import 'dashboard_screen.dart';
import 'inbox_screen.dart';
import 'notification_screen.dart';
import 'settings_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _index = 0;
  bool _wsConnected = false;
  bool _wsInitialized = false;
  int _unread = 0;
  StreamSubscription? _wsConnSub;
  StreamSubscription? _wsMsgSub;
  StreamSubscription? _wsCallSub;
  StreamSubscription? _wsConvStatusSub;
  StreamSubscription? _notifCenterSub;
  StreamSubscription? _notifRouterSub;

  static const _titles = ['डैशबोर्ड', 'इनबॉक्स', 'संपर्क और लीड्स', 'ब्रॉडकास्ट', 'सेटिंग्स'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initRealtime();
    _unread = NotificationCenter().unread;
    _notifCenterSub = NotificationCenter().onChanged.listen((_) {
      if (mounted) setState(() => _unread = NotificationCenter().unread);
    });
    _notifRouterSub = NotificationRouter().onNotification.listen(_handlePushTap);
    _checkPendingAcceptedCall();
  }

  void _checkPendingAcceptedCall() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final pending = CallKitService().takePendingAcceptCall();
      if (pending != null && mounted) {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => CallScreen(callData: pending),
          ),
        );
        Future.delayed(const Duration(milliseconds: 300), () {
          WebRTCService().answerCall(pending);
        });
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // App background se wapas aaye to realtime reconnect ke baad data refresh
    // trigger karna chahiye. WebSocketService apne aap reconnect karta hai.
    if (state == AppLifecycleState.resumed) {
      debugPrint('[HomeShell] app resumed — refresh trigger bhej rahe hain');
      DataRefreshService().trigger(RefreshReason.appResumed);
      _checkPendingAcceptedCall();
    }
  }

  Future<void> _initRealtime() async {
    final ws = WebSocketService();
    ws.connect();
    FcmService().setupForUser();
    // Android 13+ notification aur Android 14+ full-screen intent permissions.
    CallKitService().requestPermissions();
    BatteryOptimizationService().checkAndPrompt(context);
    
    // Start persistent connection service
    await DheetantraForegroundService().init();
    await DheetantraForegroundService().startService();

    _wsConnSub = ws.onConnectionChanged.listen((connected) {
      if (!mounted) return;
      setState(() {
        _wsConnected = connected;
        _wsInitialized = true;
      });
    });

    // New incoming message → notification center + unread badge.
    _wsMsgSub = ws.onNewMessage.listen((data) {
      final msg = data['message'];
      if (msg == null) return;
      final convId = msg['conversation_id'] ?? '';
      final senderType = msg['sender_type'] ?? '';
      final text = msg['content'] ?? '(मीडिया)';
      if (senderType == 'contact' || senderType == 'customer') {
        NotificationCenter().add(
          title: 'नया संदेश',
          body: text.toString(),
          type: 'message',
          data: {'conversation_id': convId, 'from': msg['from'] ?? ''},
        );
      }
    });

    _wsCallSub = ws.onCallStatusUpdated.listen((data) {
      final status = data['status'] ?? '';
      if (status == 'missed') {
        NotificationCenter().add(
          title: 'मिस्ड कॉल',
          body: 'एक WhatsApp वॉयस कॉल मिस हुई',
          type: 'call',
          data: {'call_id': data['call_id'] ?? ''},
        );
      }
    });

    // Only surface user-relevant transitions — a reopened conversation. Routine
    // admin close/reassign events would otherwise flood the notification center.
    _wsConvStatusSub = ws.onConversationStatusUpdated.listen((data) {
      final status = data['status'] ?? '';
      if (status != 'open') return;
      NotificationCenter().add(
        title: 'बातचीत खुली',
        body: 'आपकी एक बातचीत फिर से खोली गई',
        type: 'system',
        data: {'conversation_id': data['conversation_id'] ?? ''},
      );
    });
  }

  Future<void> _handlePushTap(Map<String, dynamic> data) async {
    if (!mounted) return;
    final type = data['type'] ?? '';
    if (type == 'new_message') {
      final from = data['from'] ?? '';
      final convId = data['conversation_id'] ?? '';
      // Switch to inbox, then try to open the chat.
      setState(() => _index = 1);
      if (convId.isNotEmpty) {
        await _openConversation(convId);
      } else if (from.isNotEmpty) {
        await _openConversationByPhone(from);
      }
    } else if (type == 'incoming_call') {
      final callId = data['id']?.toString() ?? '';
      if (callId.isEmpty) return;
      // Notification tap par full call screen dikhayein. Agar SDP abhi bhi valid
      // hai toh turant answer karna possible hai, nahi toh user hangup kar sakta hai.
      final callData = Map<String, dynamic>.from(data);
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => CallScreen(callData: callData),
        ),
      );
      if ((data['sdp']?.toString() ?? '').isNotEmpty) {
        Future.delayed(const Duration(milliseconds: 300), () {
          WebRTCService().answerCall(callData);
        });
      }
    } else if (type == 'missed_call') {
      final phone = data['phone'] ?? '';
      if (mounted) {
        showDialog<void>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('मिस्ड कॉल'),
            content: Text('आपकी एक WhatsApp वॉयस कॉल मिस हुई${phone.isNotEmpty ? ' (+$phone)' : ''}।'),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('ठीक है'),
              ),
            ],
          ),
        );
      }
    }
  }

  Future<void> _openConversation(String conversationId) async {
    final result = await ApiService().getMessages(conversationId);
    if (!mounted) return;
    final conv = result['conversation'];
    if (conv is Map) {
      final contactName = conv['contact_name'] ?? 'Unknown';
      final phone = conv['phone'] ?? '';
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            conversation: models.Conversation(
              id: conversationId,
              contact: models.Contact(id: conv['contact_id'] ?? '', name: contactName, phone: phone),
              messages: const [],
            ),
          ),
        ),
      );
    }
  }

  Future<void> _openConversationByPhone(String phone) async {
    final data = await ApiService().getConversations();
    if (!mounted) return;
    for (final j in data) {
      final conv = models.Conversation.fromJson(j);
      if (conv.contact.phone == phone || conv.contact.phone.replaceAll('+', '') == phone.replaceAll('+', '')) {
        Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ChatScreen(conversation: conv)),
        );
        return;
      }
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _wsConnSub?.cancel();
    _wsMsgSub?.cancel();
    _wsCallSub?.cancel();
    _wsConvStatusSub?.cancel();
    _notifCenterSub?.cancel();
    _notifRouterSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      DashboardScreen(
        onOpenInbox: () => setState(() => _index = 1),
        onOpenBroadcast: () => setState(() => _index = 3),
        onOpenNotifications: () => _openNotifications(),
      ),
      const InboxScreen(),
      const ContactsScreen(),
      const BroadcastScreen(),
      const SettingsScreen(),
    ];

    return GlobalCallOverlay(
      child: ResponsiveLayout(
        child: Scaffold(
          body: SafeArea(
            bottom: false,
            child: Column(
              children: [
                _buildHeader(_titles[_index]),
                Expanded(
                  child: IndexedStack(
                    index: _index,
                    children: screens,
                  ),
                ),
              ],
            ),
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.dashboard_outlined),
                selectedIcon: Icon(Icons.dashboard_rounded),
                label: 'होम',
              ),
              NavigationDestination(
                icon: Icon(Icons.chat_bubble_outline_rounded),
                selectedIcon: Icon(Icons.chat_bubble_rounded),
                label: 'इनबॉक्स',
              ),
              NavigationDestination(
                icon: Icon(Icons.people_alt_outlined),
                selectedIcon: Icon(Icons.people_alt_rounded),
                label: 'संपर्क',
              ),
              NavigationDestination(
                icon: Icon(Icons.campaign_outlined),
                selectedIcon: Icon(Icons.campaign_rounded),
                label: 'ब्रॉडकास्ट',
              ),
              NavigationDestination(
                icon: Icon(Icons.settings_outlined),
                selectedIcon: Icon(Icons.settings_rounded),
                label: 'सेटिंग्स',
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openNotifications() {
    NotificationCenter().markAllRead();
    setState(() => _unread = 0);
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const NotificationScreen()),
    );
  }

  Widget _buildHeader(String title) {
    final connected = _wsConnected;
    final connecting = !_wsInitialized;
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: const BoxDecoration(
        color: AppColors.background,
        border: Border(bottom: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: AppColors.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.3,
              ),
            ),
          ),
          // Realtime connection status badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: connected
                  ? AppColors.success.withValues(alpha: 0.1)
                  : AppColors.danger.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: connected
                        ? AppColors.success
                        : connecting
                            ? AppColors.warning
                            : AppColors.danger,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 5),
                Text(
                  connecting ? 'कनेक्ट' : connected ? 'Live' : 'ऑफलाइन',
                  style: TextStyle(
                    color: connected
                        ? AppColors.success
                        : connecting
                            ? AppColors.warning
                            : AppColors.danger,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Stack(
            clipBehavior: Clip.none,
            children: [
              IconButton(
                onPressed: _openNotifications,
                icon: const Icon(Icons.notifications_outlined, color: AppColors.textSecondary),
              ),
              if (_unread > 0)
                Positioned(
                  top: 5,
                  right: 5,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                    constraints: const BoxConstraints(minWidth: 16),
                    decoration: BoxDecoration(
                      color: AppColors.danger,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.background, width: 1.5),
                    ),
                    child: Text(
                      _unread > 99 ? '99+' : '$_unread',
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        height: 1.2,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
