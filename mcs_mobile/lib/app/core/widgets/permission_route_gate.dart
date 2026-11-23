import 'package:flutter/material.dart';
import 'package:get/get.dart';
import '../services/permission_service.dart';

/// Guard lokal untuk mencegah route bernama dibuka langsung tanpa permission.
/// Backend tetap menjadi pengaman utama; guard ini menjaga UX mobile/tablet.
class PermissionRouteGate extends StatefulWidget {
  final List<String> anyOf;
  final Widget child;

  const PermissionRouteGate({
    super.key,
    required this.anyOf,
    required this.child,
  });

  @override
  State<PermissionRouteGate> createState() => _PermissionRouteGateState();
}

class _PermissionRouteGateState extends State<PermissionRouteGate> {
  late final Future<bool> _allowed = _check();

  Future<bool> _check() => PermissionService.hasAny(widget.anyOf);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<bool>(
      future: _allowed,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.data == true) return widget.child;
        return Scaffold(
          appBar: AppBar(
            leading: IconButton(
              onPressed: Get.back,
              icon: const Icon(Icons.arrow_back),
            ),
            title: const Text('Access denied'),
          ),
          body: const Center(
            child: Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'You do not have permission to access this module.',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        );
      },
    );
  }
}
