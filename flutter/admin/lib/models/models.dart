class UserModel {
  final String id;
  final String name;
  final String email;
  final DateTime createdAt;
  final bool isRegistered;

  UserModel({
    required this.id,
    required this.name,
    required this.email,
    required this.createdAt,
    required this.isRegistered,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown',
      email: json['email'] ?? '',
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
      isRegistered: json['is_registered'] == 1 || json['is_registered'] == true,
    );
  }
}

class WorkspaceModel {
  final String id;
  final String name;
  final String planId;
  final DateTime createdAt;

  WorkspaceModel({
    required this.id,
    required this.name,
    required this.planId,
    required this.createdAt,
  });

  factory WorkspaceModel.fromJson(Map<String, dynamic> json) {
    return WorkspaceModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unnamed Workspace',
      planId: json['plan_id'] ?? 'free',
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
    );
  }
}

class PlanModel {
  final String id;
  final String name;
  final double price;
  final String billingPeriod;
  final bool isActive;

  PlanModel({
    required this.id,
    required this.name,
    required this.price,
    required this.billingPeriod,
    required this.isActive,
  });

  factory PlanModel.fromJson(Map<String, dynamic> json) {
    return PlanModel(
      id: json['id'] ?? '',
      name: json['name'] ?? 'Unknown Plan',
      price: (json['upfront_price'] ?? 0).toDouble(),
      billingPeriod: json['billing_period'] ?? 'monthly',
      isActive: json['is_active'] == 1 || json['is_active'] == true,
    );
  }
}


class SchoolChargeModel {
  final String workspaceId;
  final String workspaceName;
  final String planName;
  final double planAmount;
  final int subscriptionCount;
  final double activeSubscriptionAmount;
  final int paymentCount;
  final double totalCollected;
  final DateTime? lastPaymentAt;

  SchoolChargeModel({
    required this.workspaceId,
    required this.workspaceName,
    required this.planName,
    required this.planAmount,
    required this.subscriptionCount,
    required this.activeSubscriptionAmount,
    required this.paymentCount,
    required this.totalCollected,
    this.lastPaymentAt,
  });

  factory SchoolChargeModel.fromJson(Map<String, dynamic> json) {
    double toD(dynamic v) => (v is num) ? v.toDouble() : 0.0;
    int toI(dynamic v) => (v is num) ? v.toInt() : 0;
    return SchoolChargeModel(
      workspaceId: json['workspace_id'] ?? '',
      workspaceName: json['workspace_name'] ?? 'Unnamed School',
      planName: json['plan_name'] ?? 'free',
      planAmount: toD(json['plan_amount']),
      subscriptionCount: toI(json['subscription_count']),
      activeSubscriptionAmount: toD(json['active_subscription_amount']),
      paymentCount: toI(json['payment_count']),
      totalCollected: toD(json['total_collected']),
      lastPaymentAt: json['last_payment_at'] != null ? DateTime.tryParse(json['last_payment_at'].toString()) : null,
    );
  }
}
