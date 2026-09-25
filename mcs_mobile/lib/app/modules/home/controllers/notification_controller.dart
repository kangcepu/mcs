import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../../core/services/push_notification_service.dart';
import '../../../core/services/realtime_service.dart';
import '../../../core/routes/app_routes.dart';
import '../../../data/models/notification_model.dart';
import '../../../data/repositories/notification_repository.dart';
import '../views/notification_bottom_sheet.dart';

class NotificationController extends GetxController with RealtimeRefresh {
  final NotificationRepository _repository = NotificationRepository();

  final totalNotifications = 0.obs;
  final totalPreventive = 0.obs;
  final totalInProgress = 0.obs;
  final preventiveWoList = <PreventiveWo>[].obs;
  final inProgressWoList = <PreventiveWo>[].obs;
  final isLoading = false.obs;
  final hasNewNotifications = false.obs;
  final isFirstLoad = true.obs;
  Timer? _pollingTimer;

  @override
  void onInit() {
    super.onInit();
    loadNotifications();
    startPeriodicCheck();
    bindRealtime(
      const ['wo', 'approval', 'daily-control', 'any'],
      () => loadNotifications(silent: true),
      debounce: const Duration(seconds: 1),
    );
  }

  void startPeriodicCheck() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 45), (_) {
      if (!Get.isRegistered<NotificationController>()) {
        return;
      }
      loadNotifications();
    });
  }

  Future<void> loadNotifications({bool silent = false}) async {
    if (silent && isLoading.value) return;
    try {
      if (!silent) isLoading.value = true;

      final result = await _repository.getNotificationSummary();
      if (result.status && result.data != null) {
        final data = result.data!;
        final oldCount = totalNotifications.value;

        preventiveWoList.value = data.preventiveWo;
        inProgressWoList.value = data.inProgressWo;

        totalPreventive.value = data.summary.totalPreventive > 0
            ? data.summary.totalPreventive
            : preventiveWoList.length;
        totalInProgress.value = data.summary.totalInProgress > 0
            ? data.summary.totalInProgress
            : inProgressWoList.length;

        final summaryTotal = totalPreventiveCount + totalInProgressCount;
        final newCount = data.totalNotifications > 0
            ? data.totalNotifications
            : summaryTotal;

        totalNotifications.value = newCount;

        if (silent) {
          if (newCount > oldCount && oldCount > 0) {
            hasNewNotifications.value = true;
          }
        } else if (isFirstLoad.value && newCount > 0) {
          isFirstLoad.value = false;
          await Future.delayed(const Duration(milliseconds: 800));
          await showNotificationPopup();
        } else if (newCount > oldCount && oldCount > 0) {
          hasNewNotifications.value = true;
          await showNotificationPopup();
        } else {
          hasNewNotifications.value = false;
        }
      }
    } catch (_) {
      // Keep silent: notification failure must not block main home page flow.
    } finally {
      if (!silent) isLoading.value = false;
    }
  }

  @override
  void onClose() {
    _pollingTimer?.cancel();
    super.onClose();
  }

  int get totalPreventiveCount => totalPreventive.value > 0
      ? totalPreventive.value
      : preventiveWoList.length;

  int get totalInProgressCount => totalInProgress.value > 0
      ? totalInProgress.value
      : inProgressWoList.length;

  int get totalNotificationCount => totalPreventiveCount + totalInProgressCount;

  void showNotificationDialog() {
    final preventiveCount = totalPreventiveCount;
    final inProgressCount = totalInProgressCount;
    final preventiveShown = preventiveWoList.length;
    final inProgressShown = inProgressWoList.length;

    if (totalNotifications.value == 0) {
      return;
    }

    Get.dialog(
      Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF2196F3).withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.notifications_active,
                  size: 48,
                  color: Color(0xFF2196F3),
                ),
              ),
              const SizedBox(height: 20),
              const Text(
                'Work Order Notification',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 12),
              Text(
                'Ada ${totalNotifications.value} Work Order yang perlu perhatian',
                style: TextStyle(fontSize: 16, color: Colors.grey[700]),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              if (preventiveCount > 0) ...[
                InkWell(
                  onTap: () {
                    Get.back();
                    if (preventiveWoList.isNotEmpty) {
                      navigateToWoDetail(preventiveWoList.first);
                    }
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFF3E0),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFFFF6F00).withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.assignment,
                          color: Color(0xFFFF6F00),
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'WO Preventive',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              Text(
                                '$preventiveCount WO perlu dikerjakan',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[700],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.arrow_forward_ios,
                          size: 16,
                          color: Color(0xFFFF6F00),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 8),
              ],
              if (inProgressCount > 0) ...[
                InkWell(
                  onTap: () {
                    Get.back();
                    if (inProgressWoList.isNotEmpty) {
                      navigateToWoDetail(inProgressWoList.first);
                    }
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 12,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE3F2FD),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFF2196F3).withValues(alpha: 0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.sync,
                          color: Color(0xFF2196F3),
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                'WO In Progress',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                ),
                              ),
                              Text(
                                '$inProgressCount WO sedang berjalan',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.grey[700],
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Icon(
                          Icons.arrow_forward_ios,
                          size: 16,
                          color: Color(0xFF2196F3),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              if (preventiveCount > preventiveShown ||
                  inProgressCount > inProgressShown) ...[
                const SizedBox(height: 12),
                Text(
                  _buildLatestDataHint(
                    preventiveCount: preventiveCount,
                    preventiveShown: preventiveShown,
                    inProgressCount: inProgressCount,
                    inProgressShown: inProgressShown,
                  ),
                  style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                  textAlign: TextAlign.center,
                ),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Get.back(),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  child: const Text('Tutup', style: TextStyle(fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
      barrierDismissible: true,
    );
  }

  Future<void> showNotificationPopup() async {
    final preventiveCount = totalPreventiveCount;
    final inProgressCount = totalInProgressCount;

    if (totalNotifications.value <= 0) {
      return;
    }

    String message = '';
    if (preventiveCount > 0 && inProgressCount > 0) {
      message =
          '$preventiveCount WO Preventive dan $inProgressCount WO In Progress';
    } else if (preventiveCount > 0) {
      message = '$preventiveCount WO Preventive perlu dikerjakan';
    } else if (inProgressCount > 0) {
      message = '$inProgressCount WO sedang dalam progress';
    }

    if (message.isEmpty) {
      return;
    }

    await PushNotificationService.instance.showLocalNotification(
      id: DateTime.now().millisecondsSinceEpoch ~/ 1000,
      title: 'MCS Notification',
      body: message,
      payload: 'notification_summary',
    );

    Get.snackbar(
      'Notifikasi Baru',
      message,
      snackPosition: SnackPosition.TOP,
      duration: const Duration(seconds: 5),
      backgroundColor: const Color(0xFF2196F3),
      colorText: const Color(0xFFFFFFFF),
      margin: const EdgeInsets.all(16),
      borderRadius: 12,
      icon: const Icon(Icons.notifications_active, color: Colors.white),
      shouldIconPulse: true,
      onTap: (_) => showNotificationBottomSheet(),
    );
  }

  void showNotificationBottomSheet() {
    Get.bottomSheet(
      const NotificationBottomSheet(),
      backgroundColor: const Color(0xFFFFFFFF),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      isScrollControlled: true,
    );
  }

  void markAsRead() {
    hasNewNotifications.value = false;
  }

  void navigateToWoDetail(PreventiveWo wo) {
    final route = _resolveDetailRoute(wo);
    Get.toNamed(route, arguments: wo.woNumber);
  }

  String _resolveDetailRoute(PreventiveWo wo) {
    final divisionCode = (wo.divisionCode ?? '').toUpperCase().trim();
    if (_isMtcDivisionCode(divisionCode)) {
      return AppRoutes.woMtcDetail;
    }
    if (divisionCode == 'HRGA' || divisionCode == 'GA') {
      return AppRoutes.woGaDetail;
    }
    if (divisionCode == 'ITS' || divisionCode == 'IT') {
      return AppRoutes.woDetail;
    }

    final woNumber = wo.woNumber.toUpperCase();
    if (woNumber.contains('/MTC/') ||
        woNumber.contains('/MES/') ||
        woNumber.contains('/ELC/') ||
        woNumber.contains('/SPL/') ||
        woNumber.contains('/OTO/') ||
        woNumber.contains('/MKL/')) {
      return AppRoutes.woMtcDetail;
    }
    if (woNumber.contains('/IT/') || woNumber.contains('/ITS/')) {
      return AppRoutes.woDetail;
    }
    if (woNumber.contains('/GA/')) {
      return AppRoutes.woGaDetail;
    }

    return AppRoutes.woOperationalDetail;
  }

  bool _isMtcDivisionCode(String divisionCode) {
    return divisionCode == 'MTC' ||
        divisionCode == 'MES' ||
        divisionCode == 'MKL' ||
        divisionCode == 'ELC' ||
        divisionCode == 'SPL' ||
        divisionCode == 'OTO';
  }

  String _buildLatestDataHint({
    required int preventiveCount,
    required int preventiveShown,
    required int inProgressCount,
    required int inProgressShown,
  }) {
    final notes = <String>[];
    if (preventiveCount > preventiveShown) {
      notes.add('Preventive: $preventiveShown/$preventiveCount');
    }
    if (inProgressCount > inProgressShown) {
      notes.add('In Progress: $inProgressShown/$inProgressCount');
    }
    if (notes.isEmpty) {
      return '';
    }
    return 'Menampilkan data terbaru (${notes.join(' | ')})';
  }
}
