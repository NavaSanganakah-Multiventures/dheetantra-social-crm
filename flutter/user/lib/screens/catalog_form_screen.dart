import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class CatalogFormScreen extends StatefulWidget {
  final Catalog? catalog;

  const CatalogFormScreen({super.key, this.catalog});

  @override
  State<CatalogFormScreen> createState() => _CatalogFormScreenState();
}

class _CatalogFormScreenState extends State<CatalogFormScreen> {
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _status = 'active';
  File? _imageFile;
  String? _existingImageUrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.catalog != null) {
      _nameController.text = widget.catalog!.name;
      _descriptionController.text = widget.catalog!.description ?? '';
      _status = widget.catalog!.status;
      _existingImageUrl = widget.catalog!.coverImageUrl;
    }
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 1024, maxHeight: 1024);
    if (picked != null && mounted) setState(() => _imageFile = File(picked.path));
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('नाम लिखें')));
      return;
    }
    setState(() => _saving = true);
    String? imageUrl;
    if (_imageFile != null) {
      final upload = await ApiService().uploadImage(_imageFile!);
      imageUrl = upload['url'] ?? upload['mediaUrl'];
    }
    final data = {
      'name': name,
      'description': _descriptionController.text.trim(),
      'status': _status,
      if (imageUrl != null) 'cover_image_url': imageUrl,
    };
    Map<String, dynamic> res;
    if (widget.catalog == null) {
      res = await ApiService().createCatalog(data);
    } else {
      res = await ApiService().updateCatalog(widget.catalog!.id, data);
    }
    if (!mounted) return;
    setState(() => _saving = false);
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('त्रुटि: ' + res['error'].toString())));
    } else {
      Navigator.of(context).pop({'success': true, 'catalog': res['catalog']});
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.catalog != null;
    return Scaffold(
      appBar: AppBar(title: Text(isEdit ? 'कैटलॉग संपादित करें' : 'नया कैटलॉग')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          GestureDetector(
            onTap: _pickImage,
            child: Container(
              height: 160,
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.border)),
              child: _imageFile != null
                  ? ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.file(_imageFile!, width: double.infinity, fit: BoxFit.cover))
                  : _existingImageUrl != null && _existingImageUrl!.isNotEmpty
                      ? ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.network(_existingImageUrl!, width: double.infinity, fit: BoxFit.cover))
                      : const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.add_photo_alternate_outlined, color: AppColors.textMuted), SizedBox(height: 8), Text('कवर इमेज चुनें', style: TextStyle(color: AppColors.textMuted))])),
            ),
          ),
          const SizedBox(height: 20),
          TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'कैटलॉग का नाम')),
          const SizedBox(height: 16),
          TextField(controller: _descriptionController, maxLines: 3, decoration: const InputDecoration(labelText: 'विवरण')),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            value: _status,
            decoration: const InputDecoration(labelText: 'स्थिति'),
            items: ['active', 'inactive', 'draft'].map((s) => DropdownMenuItem(value: s, child: Text(s == 'active' ? 'सक्रिय' : s == 'inactive' ? 'निष्क्रिय' : 'ड्राफ्ट'))).toList(),
            onChanged: (v) => setState(() => _status = v ?? 'active'),
          ),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Text(isEdit ? 'अपडेट करें' : 'बनाएं'),
          ),
        ],
      ),
    );
  }
}
