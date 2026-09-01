import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';

class ProductFormScreen extends StatefulWidget {
  final String catalogId;
  final CatalogProduct? product;

  const ProductFormScreen({super.key, required this.catalogId, this.product});

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  final _nameController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _priceController = TextEditingController();
  final _currencyController = TextEditingController(text: 'INR');
  final _sortController = TextEditingController(text: '0');
  final _retailerIdController = TextEditingController();
  final _urlController = TextEditingController();
  bool _fetching = false;
  File? _imageFile;
  String? _existingImageUrl;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    if (widget.product != null) {
      _nameController.text = widget.product!.name;
      _descriptionController.text = widget.product!.description ?? '';
      _priceController.text = widget.product!.price.toString();
      _currencyController.text = widget.product!.currency;
      _sortController.text = widget.product!.sortOrder.toString();
      _retailerIdController.text = widget.product!.retailerId ?? '';
      _existingImageUrl = widget.product!.imageUrl;
    }
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: ImageSource.gallery, maxWidth: 1024, maxHeight: 1024);
    if (picked != null && mounted) setState(() => _imageFile = File(picked.path));
  }


  Future<void> _fetchFromUrl() async {
    final url = _urlController.text.trim();
    if (url.isEmpty) return;
    setState(() => _fetching = true);
    final res = await ApiService().fetchProductFromUrl(url);
    if (!mounted) return;
    setState(() => _fetching = false);
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Fetch failed: ' + res['error'].toString())));
      return;
    }
    final product = res['product'] as Map<String, dynamic>?;
    if (product == null) return;
    setState(() {
      if (product['name'] != null) _nameController.text = product['name'].toString();
      if (product['description'] != null) _descriptionController.text = product['description'].toString();
      if (product['price'] != null) _priceController.text = product['price'].toString();
      if (product['currency'] != null) _currencyController.text = product['currency'].toString();
      if (product['retailer_id'] != null) _retailerIdController.text = product['retailer_id'].toString();
      if (product['image_url'] != null) _existingImageUrl = product['image_url'].toString();
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Product details fetched')));
  }
  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Enter the product name')));
      return;
    }
    setState(() => _saving = true);
    String? imageUrl;
    if (_imageFile != null) {
      final upload = await ApiService().uploadImage(_imageFile!);
      imageUrl = upload['url'] ?? upload['mediaUrl'];
    }
    final price = double.tryParse(_priceController.text.trim()) ?? 0;
    final sortOrder = int.tryParse(_sortController.text.trim()) ?? 0;
    final data = {
      'name': name,
      'description': _descriptionController.text.trim(),
      'price': price,
      'currency': _currencyController.text.trim().toUpperCase(),
      'sort_order': sortOrder,
      if (imageUrl != null) 'image_url': imageUrl,
      if (_retailerIdController.text.trim().isNotEmpty) 'retailer_id': _retailerIdController.text.trim(),
    };
    Map<String, dynamic> res;
    if (widget.product == null) {
      res = await ApiService().createProduct(widget.catalogId, data);
    } else {
      res = await ApiService().updateProduct(widget.product!.id, data);
    }
    if (!mounted) return;
    setState(() => _saving = false);
    if (res['error'] != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: ' + res['error'].toString())));
    } else {
      Navigator.of(context).pop({'success': true, 'product': res['product']});
    }
  }

  @override
  Widget build(BuildContext context) {
    final isEdit = widget.product != null;
    return Scaffold(
      appBar: AppBar(title: Text(isEdit ? 'Edit product' : 'New product')),
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
                      : const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [Icon(Icons.add_photo_alternate_outlined, color: AppColors.textMuted), SizedBox(height: 8), Text('Choose product photo', style: TextStyle(color: AppColors.textMuted))])),
            ),
          ),
          const SizedBox(height: 20),
          TextField(controller: _nameController, decoration: const InputDecoration(labelText: 'Product name')),
          const SizedBox(height: 16),
          TextField(controller: _descriptionController, maxLines: 3, decoration: const InputDecoration(labelText: 'Description')),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                flex: 2,
                child: TextField(controller: _priceController, keyboardType: TextInputType.number, inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))], decoration: const InputDecoration(labelText: 'Price')),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(controller: _currencyController, textCapitalization: TextCapitalization.characters, decoration: const InputDecoration(labelText: 'Currency')),
              ),
            ],
          ),
          const SizedBox(height: 16),
          TextField(controller: _sortController, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Sort order')),          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _urlController,
                  decoration: const InputDecoration(labelText: 'Product URL', hintText: 'https://yourstore.com/product/abc'),
                ),
              ),
              const SizedBox(width: 10),
              TextButton.icon(
                onPressed: _fetching ? null : _fetchFromUrl,
                icon: _fetching ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.link),
                label: const Text('Fetch'),
              ),
            ],
          ),

          const SizedBox(height: 16),
          TextField(controller: _retailerIdController, decoration: const InputDecoration(labelText: 'Meta retailer ID (WhatsApp product)', hintText: 'e.g. SKU123')),
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : Text(isEdit ? 'Update' : 'Create'),
          ),
        ],
      ),
    );
  }
}
