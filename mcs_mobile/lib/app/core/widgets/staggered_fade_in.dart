import 'package:flutter/material.dart';
import '../constants/app_motion.dart';

/// Animasi fade+slide masuk sekali saat widget pertama kali muncul di
/// tree — dipakai buat efek "stagger" ringan waktu sebuah list pertama
/// kali dimuat.
///
/// PENTING: animasi cuma jalan sekali di `initState`, TIDAK direset tiap
/// widget rebuild (mis. gara-gara `Obx`/GetX rebuild yang tidak terkait).
/// Ini cuma benar selama pemanggil kasih `key` yang stabil per item (mis.
/// `ValueKey(item.id)`, BUKAN index) — kalau key-nya stabil, Flutter reuse
/// State yang sama dan `initState` tidak jalan ulang. Kalau tidak dikasih
/// key stabil, item yang sudah kelihatan bakal fade-in ulang terus tiap
/// rebuild dan malah kerasa norak, bukan smooth.
class StaggeredFadeIn extends StatefulWidget {
  final int index;
  final Widget child;

  /// Jumlah item pertama yang kebagian stagger delay — item di luar ini
  /// tetap fade-in tapi tanpa delay tambahan, biar list panjang tidak
  /// kelamaan nunggu animasinya selesai semua.
  static const int _maxStaggerIndex = 8;
  static const Duration _staggerStep = Duration(milliseconds: 30);

  const StaggeredFadeIn({
    super.key,
    required this.index,
    required this.child,
  });

  @override
  State<StaggeredFadeIn> createState() => _StaggeredFadeInState();
}

class _StaggeredFadeInState extends State<StaggeredFadeIn>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _opacity;
  late final Animation<Offset> _offset;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: AppMotion.base);
    _opacity = CurvedAnimation(parent: _controller, curve: AppMotion.curve);
    _offset = Tween<Offset>(begin: const Offset(0, 0.04), end: Offset.zero)
        .animate(_opacity);

    final delayIndex =
        widget.index.clamp(0, StaggeredFadeIn._maxStaggerIndex);
    final delay = StaggeredFadeIn._staggerStep * delayIndex;
    if (delay == Duration.zero) {
      _controller.forward();
    } else {
      Future.delayed(delay, () {
        if (mounted) _controller.forward();
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: SlideTransition(position: _offset, child: widget.child),
    );
  }
}
