import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../widgets/admin_drawer.dart';
import '../models/models.dart';
import '../core/constants.dart';
import '../services/api_service.dart';

class SchoolChargesScreen extends StatefulWidget {
  const SchoolChargesScreen({Key? key}) : super(key: key);

  @override
  State<SchoolChargesScreen> createState() => _SchoolChargesScreenState();
}

class _SchoolChargesScreenState extends State<SchoolChargesScreen> {
  List<SchoolChargeModel> _charges = [];
  bool _isLoading = true;
  String _error = '';

  @override
  void initState() {
    super.initState();
    _fetchCharges();
  }

  Future<void> _fetchCharges() async {
    try {
      final charges = await ApiService.fetchSchoolCharges();
      setState(() {
        _charges = charges;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  double get _grandTotal => _charges.fold<double>(0.0, (sum, c) => sum + c.totalCollected);

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(symbol: '₹', decimalDigits: 0);
    return Scaffold(
      appBar: AppBar(
        title: const Text('School Charges (Billing)'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              setState(() {
                _isLoading = true;
                _error = '';
              });
              _fetchCharges();
            },
          ),
        ],
      ),
      drawer: const AdminDrawer(currentRoute: '/school-charges'),
      body: Padding(
        padding: const EdgeInsets.all(AppPadding.medium),
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : _error.isNotEmpty
                ? Center(child: Text('Error: $_error'))
                : _charges.isEmpty
                    ? const Center(child: Text('No charges found.'))
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Card(
                            color: AppColors.primary,
                            child: Padding(
                              padding: const EdgeInsets.all(16),
                              child: Row(
                                children: [
                                  const Icon(Icons.currency_rupee, color: Colors.white, size: 32),
                                  const SizedBox(width: 12),
                                  Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('Total Collected', style: TextStyle(color: Colors.white70, fontSize: 12)),
                                      Text(currency.format(_grandTotal), style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 12),
                          Expanded(
                            child: ListView.builder(
                              itemCount: _charges.length,
                              itemBuilder: (context, index) {
                                final c = _charges[index];
                                return Card(
                                  margin: const EdgeInsets.only(bottom: 12),
                                  child: Padding(
                                    padding: const EdgeInsets.all(16),
                                    child: Row(
                                      children: [
                                        Container(
                                          width: 44,
                                          height: 44,
                                          decoration: BoxDecoration(
                                            color: Colors.green.shade100,
                                            borderRadius: BorderRadius.circular(8),
                                          ),
                                          child: Center(
                                            child: Text(
                                              c.workspaceName.isNotEmpty ? c.workspaceName.substring(0, 1).toUpperCase() : 'S',
                                              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.green.shade900),
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 14),
                                        Expanded(
                                          child: Column(
                                            crossAxisAlignment: CrossAxisAlignment.start,
                                            children: [
                                              Text(c.workspaceName, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                                              const SizedBox(height: 4),
                                              Text(
                                                'Plan: ' + c.planName + ' · ' + c.paymentCount.toString() + ' payment(s) · ' + c.subscriptionCount.toString() + ' subscription(s)',
                                                style: TextStyle(color: Colors.grey.shade600, fontSize: 12),
                                              ),
                                              if (c.lastPaymentAt != null)
                                                Text(
                                                  'Last payment: ' + DateFormat('MMM dd, yyyy').format(c.lastPaymentAt!),
                                                  style: TextStyle(color: Colors.grey.shade500, fontSize: 11),
                                                ),
                                            ],
                                          ),
                                        ),
                                        Column(
                                          crossAxisAlignment: CrossAxisAlignment.end,
                                          children: [
                                            Text(currency.format(c.totalCollected), style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.green)),
                                            if (c.activeSubscriptionAmount > 0)
                                              Text('Active sub: ' + currency.format(c.activeSubscriptionAmount), style: TextStyle(color: Colors.grey.shade500, fontSize: 11)),
                                          ],
                                        ),
                                      ],
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
      ),
    );
  }
}
