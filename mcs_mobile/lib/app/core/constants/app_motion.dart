import 'package:flutter/animation.dart';

/// Durasi & curve animasi terpusat — dipakai di seluruh app (transisi
/// halaman, feedback tap, animasi list) supaya konsisten dan tidak ada
/// angka durasi yang ngambang sendiri-sendiri di tiap widget.
class AppMotion {
  AppMotion._();

  static const Duration fast = Duration(milliseconds: 150);
  static const Duration base = Duration(milliseconds: 220);
  static const Duration slow = Duration(milliseconds: 300);

  static const Curve curve = Curves.easeOutCubic;
}
