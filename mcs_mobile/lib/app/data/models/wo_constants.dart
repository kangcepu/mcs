enum WoStatus {
  waitKaDiv('WAIT_KA_DIV', 'Waiting Division Head'),
  waitKaDeptMeso('WAIT_KA_DEPT_MESO', 'Wait MESO'),
  waitExecutorAdmin('WAIT_EXECUTOR_ADMIN', 'Wait Exec'),
  inProgressExecutor('IN_PROGRESS_EXECUTOR', 'In Progress'),
  waitingParts('WAITING_PARTS', 'Waiting Parts'),
  partsReceived('PARTS_RECEIVED', 'Parts Received'),
  completeExecutor('COMPLETE_EXECUTOR', 'Complete Executor'),
  needClosed('NEED_CLOSED', 'Need Closed'),
  complete('COMPLETE', 'Complete'),
  closed('CLOSED', 'Closed'),
  void_('VOID', 'Void'),
  decline('DECLINE', 'Declined'),
  fromMaintenance('FROM_MAINTENANCE', 'From Maintenance');

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
