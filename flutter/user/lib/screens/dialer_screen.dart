import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../services/caller_id_service.dart';
import '../theme/app_theme.dart';

/// In-app dialpad shown when the app is launched as the default dialer
/// (ACTION_DIAL). A number passed from the native [DialerRouterActivity] is
/// pre-filled. Pressing the call button places a GSM call through the platform
/// TelecomManager via [CallerIdService.placeCall]; the outgoing-call UI is then
/// rendered by [DheetantraInCallService].
class DialerScreen extends StatefulWidget {
  final String initialNumber;

  const DialerScreen({super.key, this.initialNumber = ''});

  @override
  State<DialerScreen> createState() => _DialerScreenState();
}

class _DialerScreenState extends State<DialerScreen> {
  late TextEditingController _controller;
  bool _calling = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialNumber);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _appendDigit(String d) {
    setState(() {
      _controller.text = _controller.text + d;
      _controller.selection =
          TextSelection.collapsed(offset: _controller.text.length);
    });
  }

  void _backspace() {
    final t = _controller.text;
    if (t.isEmpty) return;
    setState(() {
      _controller.text = t.substring(0, t.length - 1);
      _controller.selection =
          TextSelection.collapsed(offset: _controller.text.length);
    });
  }

  Future<void> _placeCall() async {
    final number = _controller.text.trim();
    if (number.isEmpty) return;
    if (!Platform.isAndroid) return;
    setState(() => _calling = true);
    final ok = await CallerIdService.placeCall(number);
    if (!mounted) return;
    if (!ok) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Call could not be placed. Set DheeTantra as the default dialer or grant phone permission.')),
      );
    }
    if (mounted) setState(() => _calling = false);
  }

  Widget _key(String label, {String? sub}) {
    return AspectRatio(
      aspectRatio: 1.2,
      child: Material(
        color: AppColors.surface,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: () => _appendDigit(label),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 28, fontWeight: FontWeight.w500)),
              if (sub != null)
                Text(sub, style: const TextStyle(color: AppColors.textMuted, fontSize: 11, letterSpacing: 2)),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final keys = [
      ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
      ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
      ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
      ['*', ''], ['0', '+'], ['#', ''],
    ];
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: const Text('Dialer', style: TextStyle(color: AppColors.textPrimary)),
        iconTheme: const IconThemeData(color: AppColors.textPrimary),
      ),
      body: SafeArea(
        child: Column(
          children: [
            const Spacer(),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
              child: TextField(
                controller: _controller,
                readOnly: true,
                showCursor: false,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 32, fontWeight: FontWeight.w600),
                decoration: const InputDecoration(border: InputBorder.none),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9*#+]')),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  for (int r = 0; r < 4; r++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(
                        children: [
                          for (int c = 0; c < 3; c++)
                            Expanded(
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 6),
                                child: _key(keys[r * 3 + c][0], sub: keys[r * 3 + c][1]),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const SizedBox(width: 72),
                const Spacer(),
                GestureDetector(
                  onTap: _calling ? null : _placeCall,
                  child: Container(
                    width: 64,
                    height: 64,
                    decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                    child: _calling
                        ? const Center(child: SizedBox(width: 24, height: 24, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
                        : const Icon(Icons.call_rounded, color: Colors.white, size: 30),
                  ),
                ),
                const Spacer(),
                GestureDetector(
                  onTap: _backspace,
                  child: const SizedBox(
                    width: 72,
                    height: 64,
                    child: Icon(Icons.backspace_rounded, color: AppColors.textMuted, size: 28),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}
