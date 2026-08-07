import 'package:flutter/material.dart';
import '../widgets/admin_drawer.dart';
import '../models/models.dart';
import '../core/constants.dart';

class PlansScreen extends StatelessWidget {
  const PlansScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final plans = [
      PlanModel(id: 'free', name: 'Free Plan', price: 0, billingPeriod: 'monthly', isActive: true),
      PlanModel(id: 'pro', name: 'Pro Plan', price: 2999, billingPeriod: 'monthly', isActive: true),
      PlanModel(id: 'enterprise', name: 'Enterprise', price: 9999, billingPeriod: 'yearly', isActive: true),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Billing Plans'),
      ),
      drawer: const AdminDrawer(currentRoute: '/plans'),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(AppPadding.large),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Subscription Tiers',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                ),
                ElevatedButton.icon(
                  onPressed: () {},
                  icon: const Icon(Icons.add),
                  label: const Text('Create Plan'),
                ),
              ],
            ),
            const SizedBox(height: 24),
            LayoutBuilder(
              builder: (context, constraints) {
                int crossAxisCount = 1;
                if (constraints.maxWidth > 800) crossAxisCount = 3;
                else if (constraints.maxWidth > 600) crossAxisCount = 2;

                return GridView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: crossAxisCount,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 0.8,
                  ),
                  itemCount: plans.length,
                  itemBuilder: (context, index) {
                    final plan = plans[index];
                    return Card(
                      child: Padding(
                        padding: const EdgeInsets.all(AppPadding.large),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  plan.name,
                                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold),
                                ),
                                if (plan.isActive)
                                  const Icon(Icons.check_circle, color: Colors.green)
                              ],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              '₹${plan.price.toInt()}',
                              style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w900, color: AppColors.primary),
                            ),
                            Text(
                              'per workspace / ${plan.billingPeriod}',
                              style: TextStyle(color: Colors.grey.shade600),
                            ),
                            const Spacer(),
                            const Divider(),
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.check, color: Colors.green),
                              title: const Text('All core features'),
                            ),
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: const Icon(Icons.check, color: Colors.green),
                              title: const Text('Unlimited members'),
                            ),
                            const Spacer(),
                            SizedBox(
                              width: double.infinity,
                              child: OutlinedButton(
                                onPressed: () {},
                                child: const Text('Edit Plan'),
                              ),
                            )
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
