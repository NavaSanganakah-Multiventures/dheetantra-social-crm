import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';

class TwilioSettingsScreen extends StatefulWidget {
  const TwilioSettingsScreen({super.key});

  @override
  State<TwilioSettingsScreen> createState() => _TwilioSettingsScreenState();
}

class _TwilioSettingsScreenState extends State<TwilioSettingsScreen> {
  bool _loading = true;
  List<dynamic> _configs = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
    });
    final configs = await ApiService().getTwilioConfigs();
    if (!mounted) return;
    setState(() {
      _configs = configs;
      _loading = false;
    });
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _showAccountDialog([Map<String, dynamic>? existing]) async {
    final nameCtrl = TextEditingController(text: existing?['name'] as String? ?? '');
    final sidCtrl = TextEditingController(text: existing?['accountSid'] as String? ?? '');
    final tokenCtrl = TextEditingController();
    final fromCtrl = TextEditingController();
    final appSidCtrl = TextEditingController(text: existing?['voiceApplicationSid'] as String? ?? '');
    final apiKeySidCtrl = TextEditingController(text: existing?['apiKeySid'] as String? ?? '');
    final apiKeySecretCtrl = TextEditingController();
    final pushCredAndroidCtrl = TextEditingController(text: existing?['pushCredentialSidAndroid'] as String? ?? '');
    final pushCredIosCtrl = TextEditingController(text: existing?['pushCredentialSidIos'] as String? ?? '');

    final values = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'Add Twilio Account' : 'Edit Twilio Account'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Account Name'),
              ),
              TextField(
                controller: sidCtrl,
                decoration: const InputDecoration(labelText: 'Account SID'),
              ),
              TextField(
                controller: tokenCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'Auth Token',
                  hintText: existing == null ? 'Required' : 'Leave blank (unchanged)',
                ),
              ),
              if (existing == null)
                TextField(
                  controller: fromCtrl,
                  decoration: const InputDecoration(labelText: 'From Number (optional)', hintText: '+919669509952'),
                ),
              TextField(
                controller: appSidCtrl,
                decoration: const InputDecoration(labelText: 'Voice Application SID (optional)'),
              ),
              TextField(
                controller: apiKeySidCtrl,
                decoration: const InputDecoration(labelText: 'API Key SID (optional)'),
              ),
              TextField(
                controller: apiKeySecretCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'API Key Secret (optional)',
                  hintText: existing == null ? 'Optional' : 'Leave blank to keep existing',
                ),
              ),
              TextField(
                controller: pushCredAndroidCtrl,
                decoration: const InputDecoration(labelText: 'Push Credential SID Android (optional)'),
              ),
              TextField(
                controller: pushCredIosCtrl,
                decoration: const InputDecoration(labelText: 'Push Credential SID iOS (optional)'),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop(<String, dynamic>{
                'name': nameCtrl.text.trim(),
                'accountSid': sidCtrl.text.trim(),
                'authToken': tokenCtrl.text.trim(),
                'fromNumber': fromCtrl.text.trim(),
                'voiceApplicationSid': appSidCtrl.text.trim(),
                'apiKeySid': apiKeySidCtrl.text.trim(),
                'apiKeySecret': apiKeySecretCtrl.text.trim(),
                'pushCredentialSidAndroid': pushCredAndroidCtrl.text.trim(),
                'pushCredentialSidIos': pushCredIosCtrl.text.trim(),
              });
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );

    if (values == null) return;

    final sid = values['accountSid'] as String? ?? '';
    final token = values['authToken'] as String? ?? '';
    if (sid.isEmpty) {
      _snack('Account SID is required');
      return;
    }
    if (existing == null && token.isEmpty) {
      _snack('Auth Token is required');
      return;
    }

    final name = (values['name'] as String? ?? '').isEmpty ? 'My Twilio Account' : values['name'] as String;
    final fromNumber = values['fromNumber'] as String? ?? '';

    final res = await ApiService().saveTwilioConfig(
      id: existing?['id'] as String?,
      name: name,
      accountSid: sid,
      authToken: token.isEmpty ? null : token,
      fromNumbers: (existing == null && fromNumber.isNotEmpty) ? [fromNumber] : const [],
      voiceApplicationSid: (values['voiceApplicationSid'] as String?)?.isNotEmpty == true ? values['voiceApplicationSid'] as String : null,
      apiKeySid: (values['apiKeySid'] as String?)?.isNotEmpty == true ? values['apiKeySid'] as String : null,
      apiKeySecret: (values['apiKeySecret'] as String?)?.isNotEmpty == true ? values['apiKeySecret'] as String : null,
      pushCredentialSidAndroid: (values['pushCredentialSidAndroid'] as String?)?.isNotEmpty == true ? values['pushCredentialSidAndroid'] as String : null,
      pushCredentialSidIos: (values['pushCredentialSidIos'] as String?)?.isNotEmpty == true ? values['pushCredentialSidIos'] as String : null,
    );

    if (!mounted) return;
    _snack(res['success'] == true ? 'Twilio Account saved' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _showAddNumberDialog(String configId) async {
    final ctrl = TextEditingController();
    final values = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Add From Number'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'From Number', hintText: '+919669509952'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(<String, dynamic>{
              'fromNumber': ctrl.text.trim(),
              'isDefault': false,
            }),
            child: const Text('Add'),
          ),
        ],
      ),
    );

    if (values == null) return;
    final number = values['fromNumber'] as String? ?? '';
    if (number.isEmpty) return;

    final res = await ApiService().addTwilioFromNumber(configId, number);
    if (!mounted) return;
    _snack(res['success'] == true ? 'From Number added' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _setDefault(String id) async {
    final res = await ApiService().setDefaultTwilioFromNumber(id);
    if (!mounted) return;
    _snack(res['success'] == true ? 'Default number set' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _deleteNumber(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete From Number?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    final res = await ApiService().deleteTwilioFromNumber(id);
    if (!mounted) return;
    _snack(res['success'] == true ? 'From Number deleted' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _deleteConfig(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Twilio Account?'),
        content: const Text('This will also delete all its From Numbers.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    final res = await ApiService().deleteTwilioConfig(id);
    if (!mounted) return;
    _snack(res['success'] == true ? 'Twilio Account deleted' : 'Error: ${res['error']}');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: const Text('Twilio Voice Settings'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAccountDialog(),
        icon: const Icon(Icons.add),
        label: const Text('Twilio Account'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _configs.isEmpty
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'No Twilio Account added yet.\nAdd one using the + Twilio Account button below.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textMuted),
                    ),
                  ),
                )
              : ListView(
                  padding: const EdgeInsets.all(20),
                  children: _configs.map((c) {
                    final cfg = c as Map<String, dynamic>;
                    final numbers = (cfg['fromNumbers'] as List? ?? []).cast<Map<String, dynamic>>();
                    return Card(
                      color: AppColors.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                        side: const BorderSide(color: AppColors.border),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    cfg['name'] as String? ?? 'My Twilio Account',
                                    style: const TextStyle(
                                      color: AppColors.textPrimary,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'Edit',
                                  onPressed: () => _showAccountDialog(cfg),
                                  icon: const Icon(Icons.edit_outlined, size: 20),
                                ),
                                IconButton(
                                  tooltip: 'Delete',
                                  onPressed: () => _deleteConfig(cfg['id'] as String),
                                  icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.danger),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text('SID: ${cfg['accountSid']}', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            Text('Token: ${cfg['authTokenMasked']}', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            const SizedBox(height: 12),
                            const Text(
                              'From Numbers',
                              style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
                            ),
                            const SizedBox(height: 6),
                            if (numbers.isEmpty)
                              const Text('No From Number added', style: TextStyle(color: AppColors.textMuted, fontSize: 12))
                            else
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: numbers.map((n) {
                                  final isDefault = n['isDefault'] == true;
                                  return Chip(
                                    label: Text(n['fromNumber'] as String? ?? ''),
                                    avatar: isDefault ? const Icon(Icons.star, size: 16, color: AppColors.accent) : null,
                                    onDeleted: () => _deleteNumber(n['id'] as String),
                                    deleteIcon: const Icon(Icons.close, size: 16),
                                  );
                                }).toList(),
                              ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                TextButton.icon(
                                  onPressed: () => _showAddNumberDialog(cfg['id'] as String),
                                  icon: const Icon(Icons.add, size: 18),
                                  label: const Text('Add Number'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
                ),
    );
  }
}
