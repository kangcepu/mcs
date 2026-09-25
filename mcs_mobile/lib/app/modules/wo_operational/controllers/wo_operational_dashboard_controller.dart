import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../../../core/services/realtime_service.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalDashboardController extends GetxController with RealtimeRefresh {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  
  final Rx<wo_model.DashboardStats?> stats = Rx<wo_model.DashboardStats?>(null);
  final isLoading = false.obs;
  
  final selectedCompany = 'ALL'.obs;
  final startDate = ''.obs;
  final endDate = ''.obs;

  final List<String> companyOptions = [
    'ALL',
    'PMI',
    'PMJ',
    'BOTH',
  ];

  @override
  void onInit() {
    super.onInit();
    setDefaultDateRange();
    loadDashboard();
    bindRealtime(
      const ['wo', 'wo:maintenance', 'dashboard'],
      () => loadDashboard(silent: true),
    );
  }

  void setDefaultDateRange() {
    final now = DateTime.now();
    final firstDay = DateTime(now.year, now.month, 1);
    final lastDay = DateTime(now.year, now.month + 1, 0);
    
    startDate.value = '${firstDay.year}-${firstDay.month.toString().padLeft(2, '0')}-${firstDay.day.toString().padLeft(2, '0')}';
    endDate.value = '${lastDay.year}-${lastDay.month.toString().padLeft(2, '0')}-${lastDay.day.toString().padLeft(2, '0')}';
  }

  Future<void> loadDashboard({bool silent = false}) async {
    try {
      if (!silent) isLoading.value = true;
      
      final result = await _woRepository.getDashboardStats(
        startDate: startDate.value.isEmpty ? null : startDate.value,
        endDate: endDate.value.isEmpty ? null : endDate.value,
        company: selectedCompany.value == 'ALL' ? null : selectedCompany.value,
      );
      
      stats.value = wo_model.DashboardStats.fromJson(result);
      
    } catch (e) {
      if (silent) return;
      print('Error loading dashboard: $e');
      Get.snackbar(
        'Error',
        'Failed to load dashboard: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      if (!silent) isLoading.value = false;
    }
  }

  Future<void> refresh() async {
    await loadDashboard();
  }

  void onCompanyChanged(String company) {
    selectedCompany.value = company;
    loadDashboard();
  }

  void onDateRangeChanged(String start, String end) {
    startDate.value = start;
    endDate.value = end;
    loadDashboard();
  }

  void setThisMonth() {
    setDefaultDateRange();
    loadDashboard();
  }

  void setThisWeek() {
    final now = DateTime.now();
    final firstDay = now.subtract(Duration(days: now.weekday - 1));
    final lastDay = firstDay.add(const Duration(days: 6));
    
    startDate.value = '${firstDay.year}-${firstDay.month.toString().padLeft(2, '0')}-${firstDay.day.toString().padLeft(2, '0')}';
    endDate.value = '${lastDay.year}-${lastDay.month.toString().padLeft(2, '0')}-${lastDay.day.toString().padLeft(2, '0')}';
    
    loadDashboard();
  }

  void setToday() {
    final now = DateTime.now();
    final dateStr = '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    
    startDate.value = dateStr;
    endDate.value = dateStr;
    
    loadDashboard();
  }

  Color getOpenColor() => const Color(0xFF667eea);
  Color getProgressColor() => const Color(0xFF4facfe);
  Color getClosedColor() => const Color(0xFF0be881);

  String getCompanyLabel(String company) {
    switch (company) {
      case 'ALL':
        return 'All Companies';
      case 'PMI':
        return 'PMI';
      case 'PMJ':
        return 'PMJ';
      case 'BOTH':
        return 'Both PMI & PMJ';
      default:
        return company;
    }
  }
}
