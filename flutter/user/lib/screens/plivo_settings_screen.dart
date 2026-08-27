import 'package:flutter/material.dart';

import '../services/api_service.dart';
import '../theme/app_theme.dart';

class PlivoSettingsScreen extends StatefulWidget {
  const PlivoSettingsScreen({super.key});

  @override
  State<PlivoSettingsScreen> createState() => _PlivoSettingsScreenState();
}

class _PlivoSettingsScreenState extends State<PlivoSettingsScreen> {
  bool _loading = true;
  List<dynamic> _configs = [];
  String _agentStatus = 'not_live';
  String _agentPhoneMasked = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
    });
    final configs = await ApiService().getPlivoConfigs();
    final agents = await ApiService().getVoiceAgents();

    var me = ApiService().currentUser;
    if (me == null) {
      me = await ApiService().getMe();
    }
    final myId = me?['id']?.toString();

    Map<String, dynamic>? meAgent;
    if (myId != null) {
      for (final a in agents) {
        final row = a as Map<String, dynamic>;
        if (row['userId']?.toString() == myId) {
          meAgent = row;
          break;
        }
      }
    }

    if (!mounted) return;
    setState(() {
      _configs = configs;
      _agentStatus = meAgent?['voiceStatus'] as String? ?? 'not_live';
      _agentPhoneMasked = meAgent?['phoneMasked'] as String? ?? '';
      _loading = false;
    });
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _setAgentStatus(String status) async {
    final res = await ApiService().setAgentVoiceStatus(status);
    if (!mounted) return;
    if (res['success'] == true) {
      setState(() => _agentStatus = status);
      _snack('Agent status अपडेट हो गया');
    } else {
      _snack('Error: ${res['error']}');
    }
  }

  Future<void> _editAgentPhone() async {
    final ctrl = TextEditingController();
    final value = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Agent फ़ोन सेट करें'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.phone,
          decoration: const InputDecoration(
            labelText: 'फ़ोन नंबर',
            hintText: '+919669509952',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('रद्द करें'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(ctrl.text.trim()),
            child: const Text('सेव करें'),
          ),
        ],
      ),
    );

    if (value == null || value.isEmpty) return;
    final res = await ApiService().setAgentVoicePhone(value);
    if (!mounted) return;
    if (res['success'] == true) {
      _snack('Agent फ़ोन सेव हो गया');
      await _load();
    } else {
      _snack('Error: ${res['error']}');
    }
  }

  Future<void> _showAccountDialog([Map<String, dynamic>? existing]) async {
    final nameCtrl = TextEditingController(text: existing?['name'] as String? ?? '');
    final authIdCtrl = TextEditingController(text: existing?['authId'] as String? ?? '');
    final tokenCtrl = TextEditingController();
    final fromCtrl = TextEditingController();

    final values = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(existing == null ? 'Plivo Account जोड़ें' : 'Plivo Account संपादित करें'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameCtrl,
                decoration: const InputDecoration(labelText: 'Account Name'),
              ),
              TextField(
                controller: authIdCtrl,
                decoration: const InputDecoration(labelText: 'Auth ID'),
              ),
              TextField(
                controller: tokenCtrl,
                obscureText: true,
                decoration: InputDecoration(
                  labelText: 'Auth Token',
                  hintText: existing == null ? 'Required' : 'खाली छोड़ें (अपरिवर्तित)',
                ),
              ),
              if (existing == null)
                TextField(
                  controller: fromCtrl,
                  decoration: const InputDecoration(labelText: 'From Number (optional)', hintText: '+919669509952'),
                ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('रद्द करें'),
          ),
          FilledButton(
            onPressed: () {
              Navigator.of(ctx).pop(<String, dynamic>{
                'name': nameCtrl.text.trim(),
                'authId': authIdCtrl.text.trim(),
                'authToken': tokenCtrl.text.trim(),
                'fromNumber': fromCtrl.text.trim(),
              });
            },
            child: const Text('सेव करें'),
          ),
        ],
      ),
    );

    if (values == null) return;

    final authId = values['authId'] as String? ?? '';
    final token = values['authToken'] as String? ?? '';
    if (authId.isEmpty) {
      _snack('Auth ID ज़रूरी है');
      return;
    }
    if (existing == null && token.isEmpty) {
      _snack('Auth Token ज़रूरी है');
      return;
    }

    final name = (values['name'] as String? ?? '').isEmpty ? 'My Plivo Account' : values['name'] as String;
    final fromNumber = values['fromNumber'] as String? ?? '';

    final res = await ApiService().savePlivoConfig(
      id: existing?['id'] as String?,
      name: name,
      authId: authId,
      authToken: token.isEmpty ? null : token,
      fromNumbers: (existing == null && fromNumber.isNotEmpty) ? [fromNumber] : const [],
    );

    if (!mounted) return;
    _snack(res['success'] == true ? 'Plivo Account सेव हो गया' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _showAddNumberDialog(String configId) async {
    final ctrl = TextEditingController();
    final values = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('From Number जोड़ें'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(labelText: 'From Number', hintText: '+919669509952'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('रद्द करें'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(<String, dynamic>{
              'fromNumber': ctrl.text.trim(),
              'isDefault': false,
            }),
            child: const Text('जोड़ें'),
          ),
        ],
      ),
    );

    if (values == null) return;
    final number = values['fromNumber'] as String? ?? '';
    if (number.isEmpty) return;

    final res = await ApiService().addPlivoFromNumber(configId, number);
    if (!mounted) return;
    _snack(res['success'] == true ? 'From Number जुड़ गया' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _setDefault(String id) async {
    final res = await ApiService().setDefaultPlivoFromNumber(id);
    if (!mounted) return;
    _snack(res['success'] == true ? 'Default number set हो गया' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _deleteNumber(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('From Number हटाएं?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    final res = await ApiService().deletePlivoFromNumber(id);
    if (!mounted) return;
    _snack(res['success'] == true ? 'From Number हटा दिया गया' : 'Error: ${res['error']}');
    await _load();
  }

  Future<void> _deleteConfig(String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Plivo Account हटाएं?'),
        content: const Text('इससे उसके सारे From Numbers भी हट जाएंगे।'),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('रद्द करें')),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            child: const Text('हटाएं'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    final res = await ApiService().deletePlivoConfig(id);
    if (!mounted) return;
    _snack(res['success'] == true ? 'Plivo Account हटा दिया गया' : 'Error: ${res['error']}');
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Plivo Voice Settings'),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAccountDialog(),
        icon: const Icon(Icons.add),
        label: const Text('Plivo Account'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                _buildAgentCard(),
                const SizedBox(height: 16),
                if (_configs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(24),
                    child: Text(
                      'अभी कोई Plivo Account जुड़ा नहीं है।\nनीचे + Plivo Account बटन से जोड़ें।',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textMuted),
                    ),
                  )
                else
                  ..._configs.map((c) {
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
                                    cfg['name'] as String? ?? 'My Plivo Account',
                                    style: const TextStyle(
                                      color: AppColors.textPrimary,
                                      fontSize: 16,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                                IconButton(
                                  tooltip: 'संपादित करें',
                                  onPressed: () => _showAccountDialog(cfg),
                                  icon: const Icon(Icons.edit_outlined, size: 20),
                                ),
                                IconButton(
                                  tooltip: 'हटाएं',
                                  onPressed: () => _deleteConfig(cfg['id'] as String),
                                  icon: const Icon(Icons.delete_outline, size: 20, color: AppColors.danger),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text('Auth ID: ${cfg['authId']}', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            Text('Token: ${cfg['authTokenMasked']}', style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
                            const SizedBox(height: 12),
                            const Text(
                              'From Numbers',
                              style: TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
                            ),
                            const SizedBox(height: 6),
                            if (numbers.isEmpty)
                              const Text('कोई From Number नहीं जुड़ा', style: TextStyle(color: AppColors.textMuted, fontSize: 12))
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
                                    onTap: isDefault ? null : () => _setDefault(n['id'] as String),
                                  );
                                }).toList(),
                              ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                TextButton.icon(
                                  onPressed: () => _showAddNumberDialog(cfg['id'] as String),
                                  icon: const Icon(Icons.add, size: 18),
                                  label: const Text('Number जोड़ें'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }).toList(),
              ],
            ),
    );
  }

  Widget _buildAgentCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Agent उपलब्धता',
            style: TextStyle(
              color: AppColors.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Plivo कॉल आपके PSTN फ़ोन पर आती है — पहले फ़ोन सेट करें और status Live रखें।',
            style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: Text(
                  _agentPhoneMasked.isEmpty ? 'फ़ोन सेट नहीं है' : 'फ़ोन: $_agentPhoneMasked',
                  style: TextStyle(
                    color: _agentPhoneMasked.isEmpty ? AppColors.warning : AppColors.textSecondary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              TextButton.icon(
                onPressed: _editAgentPhone,
                icon: const Icon(Icons.edit_outlined, size: 16),
                label: const Text('फ़ोन सेट करें'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              _StatusChip(label: 'Live', value: 'live', selected: _agentStatus == 'live', onTap: _setAgentStatus),
              _StatusChip(label: 'Not Live', value: 'not_live', selected: _agentStatus == 'not_live', onTap: _setAgentStatus),
              _StatusChip(label: 'Busy', value: 'busy', selected: _agentStatus == 'busy', onTap: _setAgentStatus),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final ValueChanged<String> onTap;

  const _StatusChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = value == 'live'
        ? AppColors.success
        : value == 'busy'
            ? AppColors.warning
            : AppColors.textMuted;
    return ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => onTap(value),
      selectedColor: color.withValues(alpha: 0.18),
      showCheckmark: false,
      labelStyle: TextStyle(
        color: selected ? color : AppColors.textSecondary,
        fontWeight: FontWeight.w600,
        fontSize: 12,
      ),
    );
  }
}
