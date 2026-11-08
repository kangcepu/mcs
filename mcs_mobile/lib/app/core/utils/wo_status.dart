import 'package:flutter/material.dart';

/// Padanan persis `STATUS_MAP`/`statusLabel`/`statusTone` di
/// `mcs_web/src/components/ui/status-badge.tsx` — satu sumber kebenaran
/// label+warna status WO dipakai di semua layar tablet (bukan heuristik
/// kira-kira per layar), supaya label status identik dengan web.
class WoStatusInfo {
  final Color bg;
  final Color fg;
  final String label;
  const WoStatusInfo(this.bg, this.fg, this.label);
}

const Map<String, Color> _kToneBg = {
  'green': Color(0xFFECFDF5),
  'red': Color(0xFFFFF1F2),
  'amber': Color(0xFFFFFBEB),
  'blue': Color(0xFFEFF4FF),
  'slate': Color(0xFFF1F5F9),
  'violet': Color(0xFFF5F3FF),
  'cyan': Color(0xFFECFEFF),
};
const Map<String, Color> _kToneFg = {
  'green': Color(0xFF047857),
  'red': Color(0xFFBE123C),
  'amber': Color(0xFF92400E),
  'blue': Color(0xFF1D4ED8),
  'slate': Color(0xFF475569),
  'violet': Color(0xFF6D28D9),
  'cyan': Color(0xFF0E7490),
};

class _Def {
  final String tone;
  final String label;
  const _Def(this.tone, this.label);
}

const Map<String, _Def> _kStatusMap = {
  'open': _Def('blue', 'Open'),
  'new': _Def('blue', 'Baru'),
  'draft': _Def('slate', 'Draft'),
  'pending': _Def('amber', 'Menunggu'),
  'waiting_part_selection': _Def('amber', 'Menunggu Pilih Part'),
  'waiting_part_pickup': _Def('violet', 'Menunggu Pengambilan'),
  'usage_recorded': _Def('cyan', 'Pemakaian Diisi'),
  'selected': _Def('blue', 'Part Dipilih'),
  'sent_erp': _Def('cyan', 'Dikirim ke ERP'),
  'waiting': _Def('amber', 'Menunggu'),
  'in_progress': _Def('cyan', 'Dikerjakan'),
  'in_progress_executor': _Def('cyan', 'Dalam Proses'),
  'in progress': _Def('cyan', 'Dikerjakan'),
  'progress': _Def('cyan', 'Dikerjakan'),
  'on_progress': _Def('cyan', 'Dikerjakan'),
  'running': _Def('cyan', 'Berjalan'),
  'paused': _Def('amber', 'Dijeda'),
  'hold': _Def('amber', 'Ditahan'),
  'need_approval': _Def('amber', 'Perlu Approval'),
  'approved': _Def('green', 'Disetujui'),
  'rejected': _Def('red', 'Ditolak'),
  'reject': _Def('red', 'Ditolak'),
  'done': _Def('green', 'Selesai'),
  'completed': _Def('green', 'Selesai'),
  'closed': _Def('green', 'Ditutup'),
  'close': _Def('green', 'Ditutup'),
  'cancelled': _Def('slate', 'Dibatalkan'),
  'canceled': _Def('slate', 'Dibatalkan'),
  'failed': _Def('red', 'Gagal'),
  'error': _Def('red', 'Error'),
  'synced': _Def('green', 'Tersinkron'),
  'not_synced': _Def('slate', 'Belum Sinkron'),
  'active': _Def('green', 'Aktif'),
  'inactive': _Def('slate', 'Nonaktif'),
  'pro': _Def('blue', 'PRO'),
  'cor': _Def('amber', 'COR'),
  'prev': _Def('violet', 'PREV'),
  'wait_ka_div': _Def('amber', 'Menunggu Ka Div'),
  'wait_ka_div_mtc': _Def('amber', 'Menunggu Ka Div'),
  'wait_ka_div_itis': _Def('amber', 'Menunggu Ka Div'),
  'wait_ka_div_hrga': _Def('amber', 'Menunggu Ka Div'),
  'wait_ka_dept_meso': _Def('amber', 'Menunggu Ka Dept'),
  'wait_executor_admin': _Def('amber', 'Menunggu Admin'),
  'complete_executor': _Def('cyan', 'Selesai Dikerjakan'),
  'parts_received': _Def('cyan', 'Part Diterima'),
  'waiting_parts': _Def('amber', 'Menunggu Part'),
  'forward_to_meso': _Def('violet', 'Diteruskan ke MESO'),
  'from_maintenance': _Def('violet', 'Dari Maintenance'),
  'need_closed': _Def('amber', 'Perlu Ditutup'),
  'void': _Def('slate', 'Void'),
};

String _titleCaseFallback(String key) {
  final cleaned = key.replaceAll(RegExp(r'[_-]+'), ' ');
  return cleaned
      .split(' ')
      .where((w) => w.isNotEmpty)
      .map((w) => w[0].toUpperCase() + w.substring(1))
      .join(' ');
}

WoStatusInfo woStatusInfo(String? raw) {
  final key = (raw ?? '').toLowerCase().trim();
  if (key.isEmpty) return WoStatusInfo(_kToneBg['slate']!, _kToneFg['slate']!, '-');
  final def = _kStatusMap[key];
  final tone = def?.tone ?? 'slate';
  final label = def?.label ?? _titleCaseFallback(key);
  return WoStatusInfo(_kToneBg[tone]!, _kToneFg[tone]!, label);
}
