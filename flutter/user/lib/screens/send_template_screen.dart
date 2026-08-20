import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class SendTemplateScreen extends StatefulWidget {
  const SendTemplateScreen({super.key});

  @override
  State<SendTemplateScreen> createState() => _SendTemplateScreenState();
}

class _SendTemplateScreenState extends State<SendTemplateScreen> {
  bool _loading = true;
  bool _sending = false;
  List<WhatsAppConfig> _configs = [];
  List<dynamic> _templates = [];
  WhatsAppConfig? _selectedConfig;
  dynamic _selectedTemplate;
  final _recipientController = TextEditingController();
  final List<TextEditingController> _paramControllers = [];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _loading = true);
    final configsData = await ApiService().getWhatsAppConfigs();
    final templatesData = await ApiService().getTemplates();
    if (!mounted) return;
    setState(() {
      final list = (configsData?['configs'] as List?) ?? (configsData?['config'] as List?) ?? [];
      _configs = list.map((j) => WhatsAppConfig.fromJson(j as Map<String, dynamic>)).toList();
      if (_configs.isNotEmpty) _selectedConfig = _configs.first;
      _templates = templatesData;
      if (_templates.isNotEmpty) _selectTemplate(_templates.first);
      _loading = false;
    });
  }

  void _selectTemplate(dynamic t) {
    _selectedTemplate = t;
    final body = (t['body_text'] ?? t['body'] ?? '').toString();
    final matches = RegExp(r'\{\{(\d+)\}\}').allMatches(body).toList();
    final count = matches.isEmpty ? 0 : matches.map((m) => int.parse(m.group(1)!)).reduce((a, b) => a > b ? a : b);
    _paramControllers.clear();
    for (var i = 0; i < count; i++) {
      _paramControllers.add(TextEditingController());
    }
  }

  Future<void> _send() async {
    final recipient = _recipientController.text.trim();
    if (_selectedTemplate == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कृपया टेम्प्लेट चुनें')),
      );
      return;
    }
    if (recipient.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('कृपया प्राप्तकर्ता का नंबर दर्ज करें')),
      );
      return;
    }

    setState(() => _sending = true);
    final params = _paramControllers.map((c) => c.text).toList();
    final res = await ApiService().sendTemplate(
      to: recipient,
      templateName: _selectedTemplate['name'].toString(),
      languageCode: _selectedTemplate['language']?.toString() ?? 'en_US',
      parameters: params,
      phoneNumberId: _selectedConfig?.phoneNumberId,
    );
    setState(() => _sending = false);

    if (!mounted) return;
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('त्रुटि: ${res['error']}')),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('टेम्प्लेट भेजा गया')),
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('WhatsApp टेम्प्लेट भेजें'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(20),
              children: [
                if (_templates.isEmpty)
                  const Text(
                    'कोई टेम्प्लेट उपलब्ध नहीं। कृपया पहले Meta Dashboard से टेम्प्लेट बनाएं।',
                    style: TextStyle(color: AppColors.textMuted),
                  )
                else
                  DropdownButtonFormField<dynamic>(
                    value: _selectedTemplate,
                    dropdownColor: AppColors.surfaceAlt,
                    decoration: const InputDecoration(labelText: 'टेम्प्लेट चुनें'),
                    items: _templates
                        .map((t) => DropdownMenuItem(
                              value: t,
                              child: Text(
                                t['name']?.toString() ?? 'Template',
                                style: const TextStyle(color: AppColors.textPrimary),
                              ),
                            ))
                        .toList(),
                    onChanged: (v) {
                      if (v == null) return;
                      setState(() => _selectTemplate(v));
                    },
                  ),
                const SizedBox(height: 16),
                if (_configs.length > 1)
                  DropdownButtonFormField<WhatsAppConfig>(
                    value: _selectedConfig,
                    dropdownColor: AppColors.surfaceAlt,
                    decoration: const InputDecoration(labelText: 'WhatsApp खाता चुनें'),
                    items: _configs
                        .map((c) => DropdownMenuItem(
                              value: c,
                              child: Text(
                                c.phoneNumberId,
                                style: const TextStyle(color: AppColors.textPrimary),
                              ),
                            ))
                        .toList(),
                    onChanged: (v) => setState(() => _selectedConfig = v),
                  ),
                if (_configs.length > 1) const SizedBox(height: 16),
                TextField(
                  controller: _recipientController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'प्राप्तकर्ता का नंबर',
                    hintText: '+919876543210',
                  ),
                ),
                if (_paramControllers.isNotEmpty) ...[
                  const SizedBox(height: 20),
                  const Text(
                    'टेम्प्लेट पैरामीटर',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 12),
                  for (var i = 0; i < _paramControllers.length; i++) ...[
                    TextField(
                      controller: _paramControllers[i],
                      decoration: InputDecoration(
                        labelText: 'मान ${i + 1} ({{${i + 1}}})',
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
                const SizedBox(height: 24),
                if (_selectedTemplate != null)
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'पूर्वावलोकन',
                          style: TextStyle(color: AppColors.textMuted, fontSize: 12),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _selectedTemplate['body_text']?.toString() ??
                              _selectedTemplate['body']?.toString() ??
                              '',
                          style: const TextStyle(color: AppColors.textSecondary, fontSize: 13),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _sending || _templates.isEmpty ? null : _send,
                  child: _sending
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('टेम्प्लेट भेजें'),
                ),
              ],
            ),
    );
  }
}
