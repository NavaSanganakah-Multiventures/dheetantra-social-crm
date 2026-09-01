import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:shared_preferences/shared_preferences.dart';

class BatteryOptimizationService {
  static final BatteryOptimizationService _instance = BatteryOptimizationService._internal();
  factory BatteryOptimizationService() => _instance;
  BatteryOptimizationService._internal();

  static const _promptedKey = 'battery_optimization_prompted';

  Future<bool> isOptimizationDisabled() async {
    return await Permission.ignoreBatteryOptimizations.isGranted;
  }

  Future<void> checkAndPrompt(BuildContext context) async {
    final prefs = await SharedPreferences.getInstance();
    final hasPrompted = prefs.getBool(_promptedKey) ?? false;
    
    // Check if optimization is already disabled
    if (await isOptimizationDisabled()) {
      return;
    }

    if (!hasPrompted && context.mounted) {
      await showOptimizationDialog(context);
      await prefs.setBool(_promptedKey, true);
    }
  }

  Future<void> showOptimizationDialog(BuildContext context) async {
    return showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Update battery settings'),
        content: const Text(
          'To keep DheeTantra running in the background and receive new messages (WhatsApp/Email) instantly, battery optimization must be disabled.\n\n'
          'Please go to settings and set it to "Unrestricted" or "Don\'t optimize".'
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Later'),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.of(context).pop();
              await Permission.ignoreBatteryOptimizations.request();
            },
            child: const Text('Open settings'),
          ),
        ],
      ),
    );
  }
}
