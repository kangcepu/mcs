class WoStatusLabels {
  static const Map<String, String> map = {
    'WAIT_KA_DIV': 'Menunggu Ka Div',
    'WAIT_KA_DIV_ITIS': 'Menunggu Ka Div',
    'WAIT_KA_DIV_MTC': 'Menunggu Ka Div',
    'WAIT_KA_DIV_HRGA': 'Menunggu Ka Div',
    'WAIT_KA_DEPT_MESO': 'Menunggu Ka Dept',
    'WAIT_EXECUTOR_ADMIN': 'Menunggu Admin',
    'IN_PROGRESS_EXECUTOR': 'Dalam Proses',
    'WAITING_PARTS': 'Menunggu Part',
    'PARTS_RECEIVED': 'Part Diterima',
    'COMPLETE_EXECUTOR': 'Selesai Dikerjakan',
    'NEED_CLOSED': 'Perlu Ditutup',
    'COMPLETE': 'Selesai',
    'CLOSED': 'Ditutup',
    'VOID': 'Void',
    'REJECT': 'Ditolak',
    'DECLINE': 'Ditolak',
    'FROM_MAINTENANCE': 'Dari Maintenance',
    'FORWARD_TO_MESO': 'Diteruskan ke MESO',
    'FOWARD_TO_MESO': 'Diteruskan ke MESO',
  };

  static String of(dynamic value) {
    final key = '${value ?? ''}'.trim().toUpperCase();
    if (key.isEmpty) return '-';
    final label = map[key];
    if (label != null) return label;
    return key
        .replaceAll('_', ' ')
        .toLowerCase()
        .split(' ')
        .map((w) => w.isEmpty ? w : '${w[0].toUpperCase()}${w.substring(1)}')
        .join(' ');
  }
}

enum WoStatus {
  waitKaDiv('WAIT_KA_DIV', 'Menunggu Ka Div'),
  waitKaDeptMeso('WAIT_KA_DEPT_MESO', 'Menunggu Ka Dept'),
  waitExecutorAdmin('WAIT_EXECUTOR_ADMIN', 'Menunggu Admin'),
  inProgressExecutor('IN_PROGRESS_EXECUTOR', 'Dalam Proses'),
  waitingParts('WAITING_PARTS', 'Menunggu Part'),
  partsReceived('PARTS_RECEIVED', 'Part Diterima'),
  completeExecutor('COMPLETE_EXECUTOR', 'Selesai Dikerjakan'),
  needClosed('NEED_CLOSED', 'Perlu Ditutup'),
  complete('COMPLETE', 'Selesai'),
  closed('CLOSED', 'Ditutup'),
  void_('VOID', 'Void'),
  decline('DECLINE', 'Ditolak'),
  fromMaintenance('FROM_MAINTENANCE', 'Dari Maintenance');

  final String code;
  final String label;

  const WoStatus(this.code, this.label);

  static WoStatus? fromCode(String code) {
    try {
      return WoStatus.values.firstWhere((status) => status.code == code);
    } catch (e) {
      return null;
    }
  }

  bool get isOpen => code == 'WAIT_KA_DIV';
  
  bool get isInProgress => [
    'WAIT_KA_DEPT_MESO',
    'WAIT_EXECUTOR_ADMIN',
    'IN_PROGRESS_EXECUTOR',
    'WAITING_PARTS',
    'PARTS_RECEIVED',
    'COMPLETE_EXECUTOR'
  ].contains(code);
  
  bool get isClosed => [
    'CLOSED',
    'COMPLETE',
    'NEED_CLOSED'
  ].contains(code);
  
  bool get isRejected => [
    'DECLINE',
    'VOID'
  ].contains(code);
}

enum WoType {
  corrective('CORRECTIVE'),
  preventive('PREVENTIVE'),
  project('PROJECT');

  final String code;

  const WoType(this.code);

  static WoType? fromCode(String? code) {
    if (code == null) return null;
    final normalizedCode = code.trim().toUpperCase();
    try {
      return WoType.values.firstWhere(
        (type) =>
            type.code == normalizedCode ||
            normalizedCode.startsWith('${type.code} '),
      );
    } catch (e) {
      return null;
    }
  }
}

enum WoPriority {
  normal('NORMAL'),
  emergency('EMERGENCY');

  final String code;

  const WoPriority(this.code);

  static WoPriority? fromCode(String? code) {
    if (code == null) return null;
    try {
      return WoPriority.values.firstWhere((priority) => priority.code == code);
    } catch (e) {
      return null;
    }
  }
}
enum ExecutorStatus {
  waiting('WAITING'),
  inProgress('IN_PROGRESS'),
  complete('COMPLETE'),
  additional('ADDITIONAL');

  final String code;

  const ExecutorStatus(this.code);

  static ExecutorStatus? fromCode(String code) {
    try {
      return ExecutorStatus.values.firstWhere((status) => status.code == code);
    } catch (e) {
      return null;
    }
  }
}
