import 'package:flutter/material.dart';
import '../utils/device_type.dart';

class ResponsiveAppWrapper extends StatelessWidget {
  final Widget child;

  const ResponsiveAppWrapper({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final isTablet =
        media.size.shortestSide >= kTabletShortestSideThreshold;
    final currentScale = media.textScaler.scale(14) / 14;
    final maxScale = isTablet ? 1.1 : 1.2;
    final resolvedScale = currentScale < 1.0
        ? 1.0
        : (currentScale > maxScale ? maxScale : currentScale);

    return MediaQuery(
      data: media.copyWith(
        textScaler: TextScaler.linear(resolvedScale),
      ),
      child: child,
    );
  }
}
