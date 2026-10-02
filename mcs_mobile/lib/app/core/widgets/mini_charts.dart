import 'package:flutter/material.dart';

/// Chart mini tanpa dependency (CustomPaint/Container murni) — versi
/// Flutter dari `mini-charts.tsx` di web, dipakai di Home untuk ringkasan
/// analisa tanpa harus buka daftar WO.

class MiniBarSegment {
  final String label;
  final int value;
  final Color color;
  const MiniBarSegment(this.label, this.value, this.color);
}

/// Satu bar horizontal proporsional (komposisi status) — padanan
/// `StackedBar` web, dipakai karena donat bikin status kecil gak kebaca.
class MiniStackedBar extends StatelessWidget {
  final List<MiniBarSegment> segments;
  const MiniStackedBar({super.key, required this.segments});

  @override
  Widget build(BuildContext context) {
    final total = segments.fold<int>(0, (s, x) => s + x.value);
    return ClipRRect(
      borderRadius: BorderRadius.circular(999),
      child: SizedBox(
        height: 7,
        child: total <= 0
            ? Container(color: const Color(0xFFE5E7EB))
            : Row(
                children: segments
                    .where((s) => s.value > 0)
                    .map(
                      (s) => Expanded(
                        flex: s.value,
                        child: Container(color: s.color),
                      ),
                    )
                    .toList(),
              ),
      ),
    );
  }
}

class MiniBarItem {
  final String label;
  final int value;
  final Color? color;
  const MiniBarItem(this.label, this.value, {this.color});
}

/// Daftar bar horizontal tipis — padanan `BarList` web. Tiap item bisa
/// punya warna sendiri (dipakai untuk gradasi severity umur WO).
class MiniBarList extends StatelessWidget {
  final List<MiniBarItem> items;
  final Color defaultColor;
  const MiniBarList({
    super.key,
    required this.items,
    this.defaultColor = const Color(0xFF1B54E0),
  });

  @override
  Widget build(BuildContext context) {
    final max = items.fold<int>(1, (m, i) => i.value > m ? i.value : m);
    return Column(
      children: items.map((it) {
        final frac = max <= 0 ? 0.0 : it.value / max;
        return Padding(
          padding: const EdgeInsets.only(bottom: 5),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      it.label,
                      style: const TextStyle(
                        fontSize: 9.5,
                        color: Color(0xFF64748B),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    '${it.value}',
                    style: const TextStyle(
                      fontSize: 9.5,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF1F2937),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: SizedBox(
                  height: 4,
                  child: Stack(
                    children: [
                      Container(color: const Color(0xFFE5E7EB)),
                      FractionallySizedBox(
                        widthFactor: frac.clamp(0, 1),
                        child: Container(color: it.color ?? defaultColor),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }).toList(),
    );
  }
}

class MiniTrendPoint {
  final String date;
  final double a;
  final double b;
  const MiniTrendPoint(this.date, this.a, this.b);
}

/// Dua garis tren (dibuat vs ditutup) tanpa sumbu — padanan ringkas
/// `TrendChart` web.
class MiniTrendChart extends StatelessWidget {
  final List<MiniTrendPoint> data;
  final Color colorA;
  final Color colorB;
  final double height;
  const MiniTrendChart({
    super.key,
    required this.data,
    required this.colorA,
    required this.colorB,
    this.height = 48,
  });

  @override
  Widget build(BuildContext context) {
    if (data.length < 2) return SizedBox(height: height);
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(
        painter: _TrendPainter(data: data, colorA: colorA, colorB: colorB),
      ),
    );
  }
}

class _TrendPainter extends CustomPainter {
  final List<MiniTrendPoint> data;
  final Color colorA;
  final Color colorB;
  _TrendPainter({required this.data, required this.colorA, required this.colorB});

  @override
  void paint(Canvas canvas, Size size) {
    var maxVal = 1.0;
    for (final p in data) {
      if (p.a > maxVal) maxVal = p.a;
      if (p.b > maxVal) maxVal = p.b;
    }
    final n = data.length;
    double x(int i) => n <= 1 ? size.width / 2 : (i / (n - 1)) * size.width;
    double y(double v) => size.height - (v / maxVal) * size.height;

    void drawLine(double Function(MiniTrendPoint) pick, Color color) {
      final path = Path();
      for (var i = 0; i < n; i++) {
        final px = x(i);
        final py = y(pick(data[i]));
        if (i == 0) {
          path.moveTo(px, py);
        } else {
          path.lineTo(px, py);
        }
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6
          ..strokeJoin = StrokeJoin.round
          ..strokeCap = StrokeCap.round,
      );
    }

    drawLine((p) => p.a, colorA);
    drawLine((p) => p.b, colorB);
  }

  @override
  bool shouldRepaint(covariant _TrendPainter oldDelegate) =>
      oldDelegate.data != data;
}

/// Garis kecil tanpa sumbu + opsional garis target putus-putus — padanan
/// `Sparkline` web, dipakai di kartu Rasio Preventive.
class MiniSparkline extends StatelessWidget {
  final List<double?> values;
  final double? target;
  final Color color;
  final double width;
  final double height;
  const MiniSparkline({
    super.key,
    required this.values,
    this.target,
    this.color = const Color(0xFF16A34A),
    this.width = 56,
    this.height = 22,
  });

  @override
  Widget build(BuildContext context) {
    final points = values.whereType<double>().toList();
    if (points.length < 2) return SizedBox(width: width, height: height);
    return SizedBox(
      width: width,
      height: height,
      child: CustomPaint(
        painter: _SparkPainter(points: points, target: target, color: color),
      ),
    );
  }
}

class _SparkPainter extends CustomPainter {
  final List<double> points;
  final double? target;
  final Color color;
  _SparkPainter({required this.points, this.target, required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final all = [...points, if (target != null) target!];
    var minV = all.first;
    var maxV = all.first;
    for (final v in all) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    final range = (maxV - minV).abs() < 1e-6 ? 1.0 : (maxV - minV);
    double x(int i) =>
        points.length <= 1 ? size.width / 2 : (i / (points.length - 1)) * size.width;
    double y(double v) => size.height - ((v - minV) / range) * size.height;

    if (target != null) {
      final ty = y(target!);
      final dashPaint = Paint()
        ..color = const Color(0xFFCBD5E1)
        ..strokeWidth = 1;
      var dx = 0.0;
      while (dx < size.width) {
        canvas.drawLine(Offset(dx, ty), Offset(dx + 3, ty), dashPaint);
        dx += 5;
      }
    }

    final path = Path();
    for (var i = 0; i < points.length; i++) {
      final px = x(i);
      final py = y(points[i]);
      if (i == 0) {
        path.moveTo(px, py);
      } else {
        path.lineTo(px, py);
      }
    }
    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    canvas.drawCircle(
      Offset(x(points.length - 1), y(points.last)),
      2,
      Paint()..color = color,
    );
  }

  @override
  bool shouldRepaint(covariant _SparkPainter oldDelegate) =>
      oldDelegate.points != points || oldDelegate.target != target;
}

class TrendPoint {
  final String date;
  final double created;
  final double closed;
  /// WO Corrective yang CLOSED hari itu — "closed" global aja gak cukup
  /// buat lihat beban kerja reaktif/breakdown harian.
  final double closedCorrective;
  const TrendPoint(this.date, this.created, this.closed, [this.closedCorrective = 0]);
}

enum _TextAlignX { start, center, end }

/// Grafik tren lengkap — sumbu, gridline, label semua tanggal, legenda —
/// padanan penuh `TrendChart` web (bukan versi mini), cuma di-scale
/// buat lebar layar HP. Dipakai di kartu "Tren Work Order" Home.
class TrendChartFull extends StatelessWidget {
  final List<TrendPoint> data;
  final double height;
  const TrendChartFull({super.key, required this.data, this.height = 96});

  @override
  Widget build(BuildContext context) {
    if (data.length < 2) {
      return SizedBox(
        height: height,
        child: const Center(
          child: Text(
            'Belum ada data',
            style: TextStyle(fontSize: 10, color: Color(0xFF94A3B8)),
          ),
        ),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: height,
          width: double.infinity,
          child: CustomPaint(painter: _TrendFullPainter(data: data)),
        ),
        const SizedBox(height: 4),
        const Wrap(
          spacing: 14,
          runSpacing: 2,
          children: [
            _TrendLegend(color: Color(0xFF1B54E0), label: 'Dibuat'),
            _TrendLegend(color: Color(0xFF16A34A), label: 'Ditutup', dashed: true),
            _TrendLegend(color: Color(0xFFF59E0B), label: 'CM Selesai'),
          ],
        ),
      ],
    );
  }
}

class _TrendLegend extends StatelessWidget {
  final Color color;
  final String label;
  final bool dashed;
  const _TrendLegend({required this.color, required this.label, this.dashed = false});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 14,
          height: 2,
          child: dashed
              ? CustomPaint(painter: _DashSwatchPainter(color: color))
              : ColoredBox(color: color),
        ),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 9.5, color: Color(0xFF64748B))),
      ],
    );
  }
}

class _DashSwatchPainter extends CustomPainter {
  final Color color;
  _DashSwatchPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2;
    var dx = 0.0;
    while (dx < size.width) {
      canvas.drawLine(Offset(dx, size.height / 2), Offset(dx + 3, size.height / 2), paint);
      dx += 5;
    }
  }

  @override
  bool shouldRepaint(covariant _DashSwatchPainter oldDelegate) => false;
}

class _TrendFullPainter extends CustomPainter {
  final List<TrendPoint> data;
  _TrendFullPainter({required this.data});

  static const _padL = 20.0;
  static const _padR = 4.0;
  static const _padT = 6.0;
  static const _padB = 14.0;

  @override
  void paint(Canvas canvas, Size size) {
    final iw = size.width - _padL - _padR;
    final ih = size.height - _padT - _padB;
    final n = data.length;
    var maxVal = 1.0;
    var maxCorrective = 1.0;
    for (final p in data) {
      if (p.created > maxVal) maxVal = p.created;
      if (p.closed > maxVal) maxVal = p.closed;
      if (p.closedCorrective > maxCorrective) maxCorrective = p.closedCorrective;
    }

    double x(int i) => _padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    double y(double v) => _padT + ih - (v / maxVal) * ih;
    // Skala sendiri buat CM Selesai (nilainya jauh lebih kecil dari
    // dibuat/ditutup) — biar bentuk tren harian tetap kebaca, bukan
    // kegencet rata di bawah kalau dipaksa satu skala sama rata.
    double yC(double v) => _padT + ih - (v / maxCorrective) * ih;

    final ticks = [0.0, (maxVal / 2).roundToDouble(), maxVal];
    final gridPaint = Paint()
      ..color = const Color(0xFFF1F5F9)
      ..strokeWidth = 1;
    for (final t in ticks) {
      final ty = y(t);
      canvas.drawLine(Offset(_padL, ty), Offset(size.width - _padR, ty), gridPaint);
      _drawText(canvas, t.round().toString(), Offset(0, ty - 5), const Color(0xFF94A3B8), 8);
    }

    void drawSolid(double Function(TrendPoint) pick, double Function(double) yFn, Color color, double width) {
      final path = Path();
      for (var i = 0; i < n; i++) {
        final px = x(i);
        final py = yFn(pick(data[i]));
        if (i == 0) {
          path.moveTo(px, py);
        } else {
          path.lineTo(px, py);
        }
      }
      canvas.drawPath(
        path,
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = width
          ..strokeJoin = StrokeJoin.round
          ..strokeCap = StrokeCap.round,
      );
    }

    void drawDashed(double Function(TrendPoint) pick, double Function(double) yFn, Color color) {
      for (var i = 0; i < n - 1; i++) {
        final a = Offset(x(i), yFn(pick(data[i])));
        final b = Offset(x(i + 1), yFn(pick(data[i + 1])));
        _drawDashedLine(canvas, a, b, color);
      }
    }

    drawSolid((p) => p.created, y, const Color(0xFF1B54E0), 1.8);
    drawDashed((p) => p.closed, y, const Color(0xFF16A34A));
    drawSolid((p) => p.closedCorrective, yC, const Color(0xFFF59E0B), 1.4);

    // Semua titik tanggal dikasih label (bukan di-thin kayak dulu), anchor
    // ujung kiri/kanan disesuaikan biar gak kepotong — sama kayak fix di web.
    for (var i = 0; i < n; i++) {
      final raw = data[i].date;
      final label = raw.length >= 5 ? raw.substring(5) : raw;
      final align = i == 0
          ? _TextAlignX.start
          : (i == n - 1 ? _TextAlignX.end : _TextAlignX.center);
      _drawText(canvas, label, Offset(x(i), size.height - 10), const Color(0xFF94A3B8), 8, align: align);
    }
  }

  void _drawDashedLine(Canvas canvas, Offset a, Offset b, Color color) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round;
    final dist = (b - a).distance;
    if (dist == 0) return;
    const dashLen = 4.0;
    const gapLen = 3.0;
    var covered = 0.0;
    final dir = Offset((b.dx - a.dx) / dist, (b.dy - a.dy) / dist);
    while (covered < dist) {
      final segEnd = (covered + dashLen) > dist ? dist : (covered + dashLen);
      final start = a + dir * covered;
      final end = a + dir * segEnd;
      canvas.drawLine(start, end, paint);
      covered += dashLen + gapLen;
    }
  }

  void _drawText(
    Canvas canvas,
    String text,
    Offset pos,
    Color color,
    double fontSize, {
    _TextAlignX align = _TextAlignX.start,
  }) {
    final tp = TextPainter(
      text: TextSpan(text: text, style: TextStyle(color: color, fontSize: fontSize)),
      textDirection: TextDirection.ltr,
    )..layout();
    double dx;
    switch (align) {
      case _TextAlignX.start:
        dx = pos.dx;
        break;
      case _TextAlignX.end:
        dx = pos.dx - tp.width;
        break;
      case _TextAlignX.center:
        dx = pos.dx - tp.width / 2;
        break;
    }
    tp.paint(canvas, Offset(dx, pos.dy));
  }

  @override
  bool shouldRepaint(covariant _TrendFullPainter oldDelegate) => oldDelegate.data != data;
}

class DailyStatusPoint {
  final String date;
  final double closedPct;
  final double inProgressPct;
  final double openPct;
  final int total;
  const DailyStatusPoint(this.date, this.closedPct, this.inProgressPct, this.openPct, this.total);
}

/// Satu bar 100%-tinggi per hari (Selesai/Dikerjakan/Belum Dikerjakan) — versi
/// ringkas mobile dari `DailyStatusBars` web, dipakai di kartu "Preventive
/// Harian" buat lihat konsistensi eksekusi harian, bukan cuma rasio total.
class DailyStatusBars extends StatelessWidget {
  final List<DailyStatusPoint> data;
  final double barHeight;
  const DailyStatusBars({super.key, required this.data, this.barHeight = 40});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: data
          .map(
            (d) => Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: Container(
                        height: barHeight,
                        width: double.infinity,
                        color: const Color(0xFFE5E7EB),
                        child: d.total > 0
                            ? Column(
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  if (d.openPct > 0)
                                    Expanded(
                                      flex: (d.openPct * 10).round().clamp(1, 1000),
                                      child: Container(color: const Color(0xFFF59E0B)),
                                    ),
                                  if (d.inProgressPct > 0)
                                    Expanded(
                                      flex: (d.inProgressPct * 10).round().clamp(1, 1000),
                                      child: Container(color: const Color(0xFF1B54E0)),
                                    ),
                                  if (d.closedPct > 0)
                                    Expanded(
                                      flex: (d.closedPct * 10).round().clamp(1, 1000),
                                      child: Container(color: const Color(0xFF16A34A)),
                                    ),
                                ],
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      d.date.length >= 10 ? d.date.substring(8, 10) : d.date,
                      style: const TextStyle(fontSize: 8, color: Color(0xFF94A3B8)),
                    ),
                  ],
                ),
              ),
            ),
          )
          .toList(),
    );
  }
}
