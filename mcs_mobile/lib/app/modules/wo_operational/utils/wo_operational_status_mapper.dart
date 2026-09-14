import 'package:flutter/material.dart';

class WoOperationalStatusMapper {
  static String mapStatusDisplay(String status) {
    const statusMap = {
      'COMPLETE_EXECUTOR': 'DONE',
      'IN_PROGRESS_EXECUTOR': 'PROGRESS',
      'NEED_CLOSED': 'CLOSE',
      'WAIT_KA_DEPT_MESO': 'WAIT MESO',
      'WAIT_KA_DIV_ITIS': 'WAIT IT',
      'WAIT_KA_DIV_MTC': 'WAIT MTC',
      'PARTS_RECEIVED': 'PART OK',
      'WAITING_PARTS': 'WAIT PART',
      'FOWARD_TO_MESO': 'MESO',
      'FORWARD_TO_MESO': 'MESO',
      'WAIT_EXECUTOR_ADMIN': 'WAIT ADMIN',
      'WAIT_KA_DIV': 'WAIT DIV',
      'CLOSED': 'CLOSED',
      'REJECT': 'REJECT',
      'DECLINE': 'DECLINE',
      'FROM_MAINTENANCE': 'FROM MTC',
      'COMPLETE': 'COMPLETE',
      'VOID': 'VOID',
    };

    final normalized = status.trim().toUpperCase();
    return statusMap[normalized] ?? normalized;
  }

  static String badgeClass(String displayStatus) {
    const classMap = {
      'DONE': 'cyan',
      'PROGRESS': 'cyan',
      'CLOSE': 'orange',
      'WAIT MESO': 'yellow',
      'WAIT IT': 'yellow',
      'WAIT MTC': 'yellow',
      'PART OK': 'cyan',
      'WAIT PART': 'yellow',
      'MESO': 'cyan',
      'WAIT ADMIN': 'green',
      'WAIT DIV': 'yellow',
      'CLOSED': 'gray',
      'REJECT': 'red',
      'DECLINE': 'red',
      'FROM MTC': 'cyan',
      'COMPLETE': 'cyan',
      'VOID': 'red',
    };

    return classMap[displayStatus.trim().toUpperCase()] ?? 'gray';
  }

  static Color badgeTextColor(String status) {
    switch (badgeClass(mapStatusDisplay(status))) {
      case 'cyan':
        return const Color(0xFF0E7490);
      case 'green':
        return const Color(0xFF065F46);
      case 'yellow':
        return const Color(0xFF92400E);
      case 'orange':
        return const Color(0xFF9A3412);
      case 'red':
        return const Color(0xFF991B1B);
      default:
        return const Color(0xFF374151);
    }
  }

  static Color badgeBgColor(String status) {
    switch (badgeClass(mapStatusDisplay(status))) {
      case 'cyan':
        return const Color(0xFFCFFAFE);
      case 'green':
        return const Color(0xFFD1FAE5);
      case 'yellow':
        return const Color(0xFFFEF3C7);
      case 'orange':
        return const Color(0xFFFED7AA);
      case 'red':
        return const Color(0xFFFECACA);
      default:
        return const Color(0xFFE5E7EB);
    }
  }
}

