class DashboardStats {
  final int open;
  final int inProgress;
  final int closed;
  final int total;
  final double openPercentage;
  final double progressPercentage;
  final double closedPercentage;
  final DashboardPeriod? period;

  DashboardStats({
    required this.open,
    required this.inProgress,
    required this.closed,
    required this.total,
    required this.openPercentage,
    required this.progressPercentage,
    required this.closedPercentage,
    this.period,
  });

  
  
  factory DashboardStats.fromJson(Map<String, dynamic> json) {
    return DashboardStats(
      open: int.tryParse(json['open']?.toString() ?? '0') ?? 0,
      inProgress: int.tryParse(json['in_progress']?.toString() ?? '0') ?? 0,
      closed: int.tryParse(json['closed']?.toString() ?? '0') ?? 0,
      total: int.tryParse(json['total']?.toString() ?? '0') ?? 0,
      openPercentage: double.tryParse(json['open_percentage']?.toString() ?? '0') ?? 0.0,
      progressPercentage: double.tryParse(json['progress_percentage']?.toString() ?? '0') ?? 0.0,
      closedPercentage: double.tryParse(json['closed_percentage']?.toString() ?? '0') ?? 0.0,
      period: json['period'] != null 
          ? DashboardPeriod.fromJson(json['period']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'open': open,
      'in_progress': inProgress,
      'closed': closed,
      'total': total,
      'open_percentage': openPercentage,
      'progress_percentage': progressPercentage,
      'closed_percentage': closedPercentage,
      'period': period?.toJson(),
    };
  }
}

class DashboardPeriod {
  final String? startDate;
  final String? endDate;
  final String company;

  DashboardPeriod({
    this.startDate,
    this.endDate,
    required this.company,
  });

  factory DashboardPeriod.fromJson(Map<String, dynamic> json) {
    return DashboardPeriod(
      startDate: json['start_date'],
      endDate: json['end_date'],
      company: json['company'] ?? 'ALL',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'start_date': startDate,
      'end_date': endDate,
      'company': company,
    };
  }
  
}
