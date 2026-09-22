import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../controllers/wo_detail_controller.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../core/widgets/custom_card.dart';
import '../../../core/widgets/request_part_dialog.dart';
import '../../../core/widgets/work_order_detail_tabs.dart';
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/widgets/video_player_page.dart';
import 'package:multi_select_flutter/multi_select_flutter.dart';

class WoDetailPage extends StatelessWidget {
  const WoDetailPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final WoDetailController controller = Get.put(WoDetailController());

    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        title: const Text('Detail Work Order'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: controller.refresh,
          ),
          Obx(() {
            if (controller.canVoid) {
              return PopupMenuButton(
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'void',
                    child: Row(
                      children: [
                        Icon(Icons.cancel, color: Colors.red),
                        SizedBox(width: 8),
                        Text('Void WO'),
                      ],
                    ),
                  ),
                ],
                onSelected: (value) {
                  if (value == 'void') {
                    _showVoidDialog(context, controller);
                  }
                },
              );
            }
            return const SizedBox();
          }),
        ],
      ),
      body: Obx(() {
        if (controller.isLoading.value) {
          return Center(
            child: SpinKitFadingCircle(
              color: AppColors.primary,
              size: 50,
            ),
          );
        }

        if (controller.woDetail.value == null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.error_outline, size: 64, color: AppColors.grey),
                const SizedBox(height: 16),
                Text(
                  'Data tidak ditemukan',
                  style:
                      TextStyle(fontSize: 16, color: AppColors.textSecondary),
                ),
              ],
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: controller.refresh,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildHeaderCard(controller),
                _buildTabNavigation(controller),
                _buildSelectedTabContent(controller, context),
              ],
            ),
          ),
        );
      }),
    );
  }

  Widget _buildTabNavigation(WoDetailController controller) {
    return Obx(() => WorkOrderDetailTabs(
          selectedIndex: controller.selectedDetailTab.value,
          onSelected: controller.setSelectedDetailTab,
        ));
  }

  Widget _buildSelectedTabContent(
      WoDetailController controller, BuildContext context) {
    return Obx(() {
      switch (controller.selectedDetailTab.value) {
        case 1:
          return Padding(
            padding: const EdgeInsets.all(12),
            child: _buildSimpleInfoCard(
              title: 'Preventive',
              child: const Text('WO IS tidak memiliki detail preventive.'),
            ),
          );
        case 2:
          return Column(children: [
            _buildResourceActionPanel(controller, context),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _buildExecutorsCard(controller),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _buildLaborCard(controller),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: _buildMaterialCard(controller),
            ),
          ]);
        case 3:
          return Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: _buildApprovalsCard(controller, context),
          );
        case 0:
        default:
          return Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: _buildDetailsCard(controller),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: _buildQuickInfoCard(controller),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: _buildServicePhotosCard(controller),
            ),
          ]);
      }
    });
  }

  Widget _buildResourceActionPanel(
      WoDetailController controller, BuildContext context) {
    if (!controller.canExecute &&
        !controller.canComplete &&
        !controller.canClose) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: _buildSimpleInfoCard(
        title: 'Aksi Cepat',
        child: Column(
          children: [
            if (controller.canExecute) ...[
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Update Progress',
                      icon: Icons.edit_note,
                      backgroundColor: AppColors.primary,
                      onTap: () =>
                          _showJobExplanationDialog(context, controller),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Labor / PIC',
                      icon: Icons.groups_2_outlined,
                      backgroundColor: const Color(0xFFF59E0B),
                      onTap: () => _showAddLaborDialog(context, controller),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildQuickActionButton(
                      label: 'Request Part',
                      icon: Icons.inventory_2_outlined,
                      backgroundColor: const Color(0xFF9333EA),
                      onTap: () => _showAddMaterialDialog(context, controller),
                    ),
                  ),
                  if (controller.canComplete) ...[
                    const SizedBox(width: 10),
                    Expanded(
                      child: _buildQuickActionButton(
                        label: 'Complete',
                        icon: Icons.done_all,
                        backgroundColor: const Color(0xFF16A34A),
                        onTap: () => _showCompleteDialog(context, controller),
                      ),
                    ),
                  ],
                ],
              ),
            ] else if (controller.canClose)
              _buildQuickActionButton(
                label: 'Close Work Order',
                icon: Icons.close_fullscreen,
                backgroundColor: const Color(0xFFDC2626),
                onTap: () => _showCloseDialog(context, controller),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickActionButton({
    required String label,
    required IconData icon,
    required Color backgroundColor,
    required VoidCallback onTap,
  }) {
    return Material(
      color: backgroundColor,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 18, color: Colors.white),
              const SizedBox(width: 7),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSimpleInfoCard({
    required String title,
    required Widget child,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }

  Widget _buildQuickInfoCard(WoDetailController controller) {
    final header = controller.woHeader;
    return _buildSimpleInfoCard(
      title: 'Informasi WO',
      child: Column(
        children: [
          _buildQuickInfoItem(
            Icons.business_outlined,
            'Company',
            shortCompanyLabel(header['company']?.toString()),
          ),
          const Divider(height: 20),
          _buildQuickInfoItem(
            Icons.account_tree_outlined,
            'Division',
            (header['division_name'] ?? '-').toString(),
          ),
          const Divider(height: 20),
          _buildQuickInfoItem(
            Icons.person_outline,
            'Creator',
            (header['creator'] ?? '-').toString(),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickInfoItem(IconData icon, String label, String value) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.primary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label,
                  style:
                      TextStyle(fontSize: 11, color: AppColors.textSecondary)),
              const SizedBox(height: 2),
              Text(value.trim().isEmpty ? '-' : value,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildApprovalsCard(
      WoDetailController controller, BuildContext context) {
    final approvals = controller.approvals;
    return _buildSimpleInfoCard(
      title: 'Riwayat & Approval',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildStatusMessage(controller),
          if (approvals.isNotEmpty) ...[
            const SizedBox(height: 14),
            ...approvals.map((item) {
              final row = item is Map ? item : <String, dynamic>{};
              final actor = (row['fullname'] ?? row['alias'] ?? '-').toString();
              final status =
                  (row['status'] ?? row['approval_status'] ?? '-').toString();
              final comment =
                  (row['comment'] ?? row['remarks'] ?? '').toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check_circle_outline,
                        size: 18, color: AppColors.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(actor,
                              style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w700)),
                          Text(status,
                              style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary)),
                          if (comment.trim().isNotEmpty)
                            Text(comment,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          if (approvals.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text('Belum ada riwayat approval',
                  style: TextStyle(color: AppColors.textSecondary)),
            ),
          if (controller.canApprove) ...[
            const Divider(height: 24),
            _buildQuickActionButton(
              label: 'Approve Work Order',
              icon: Icons.check_circle,
              backgroundColor: const Color(0xFF16A34A),
              onTap: () => _showApproveDialog(context, controller),
            ),
          ],
        ],
      ),
    );
  }

  void _showApproveDialog(BuildContext context, WoDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Approve Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.approveWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  void _showJobExplanationDialog(
      BuildContext context, WoDetailController controller) {
    final explanationController = TextEditingController();
    final List<File> selectedServicePhotos = [];
    String selectedStatus = 'IN_PROGRESS';
    const maxServicePhotos = 5;

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          Future<void> pickServicePhotoFromCamera() async {
            final file = await MediaPickerHelper.pickImageFromCamera();
            if (file != null) {
              setState(() {
                if (selectedServicePhotos.length >= maxServicePhotos) {
                  Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                  return;
                }
                selectedServicePhotos.add(file);
              });
            }
          }

          Future<void> pickServicePhotoFromGallery() async {
            final files = await MediaPickerHelper.pickMultiImageFromGallery();
            if (files.isNotEmpty) {
              setState(() {
                final available =
                    maxServicePhotos - selectedServicePhotos.length;
                if (available <= 0) {
                  Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                  return;
                }
                if (files.length > available) {
                  Get.snackbar('Limit',
                      'Maksimal $maxServicePhotos foto (sisanya diabaikan)');
                }
                selectedServicePhotos.addAll(files.take(available));
              });
            }
          }

          void addServiceVideo(File video) {
            if (selectedServicePhotos.length >= maxServicePhotos) {
              Get.snackbar('Limit', 'Maksimal $maxServicePhotos file');
              return;
            }
            setState(() => selectedServicePhotos.add(video));
          }

          Future<void> pickServiceVideoFromCamera() async {
            final video = await MediaPickerHelper.pickVideoFromCamera();
            if (video != null) addServiceVideo(video);
          }

          Future<void> pickServiceVideoFromGallery() async {
            final video = await MediaPickerHelper.pickVideoFromGallery();
            if (video != null) addServiceVideo(video);
          }

          void showServiceVideoOptions() {
            Get.bottomSheet(
              SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.videocam),
                      title: const Text('Rekam Video'),
                      onTap: () {
                        Get.back();
                        pickServiceVideoFromCamera();
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.video_library),
                      title: const Text('Pilih Video Galeri'),
                      onTap: () {
                        Get.back();
                        pickServiceVideoFromGallery();
                      },
                    ),
                  ],
                ),
              ),
            );
          }

          return AlertDialog(
            title: const Text('Update Progress'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: explanationController,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Job Explanation',
                      border: OutlineInputBorder(),
                      hintText: 'Masukkan progress pekerjaan...',
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: selectedStatus,
                    decoration: const InputDecoration(
                      labelText: 'Status',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                          value: 'IN_PROGRESS', child: Text('IN PROGRESS')),
                      DropdownMenuItem(
                          value: 'COMPLETE', child: Text('COMPLETE')),
                    ],
                    onChanged: (value) {
                      setState(() {
                        selectedStatus = value!;
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Bukti Foto/Video Service (Wajib)',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickServicePhotoFromCamera,
                          icon: const Icon(Icons.photo_camera),
                          label: const Text('Camera'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickServicePhotoFromGallery,
                          icon: const Icon(Icons.photo_library),
                          label: const Text('Gallery'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: showServiceVideoOptions,
                      icon: const Icon(Icons.videocam),
                      label: const Text('Video'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      '${selectedServicePhotos.length} file dipilih',
                      style: TextStyle(
                        color: selectedServicePhotos.isEmpty
                            ? Colors.red
                            : Colors.green,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  if (selectedServicePhotos.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children:
                          List.generate(selectedServicePhotos.length, (index) {
                        final file = selectedServicePhotos[index]
                            .path
                            .split(RegExp(r'[\\/]'))
                            .last;
                        return InputChip(
                          label: Text(file, overflow: TextOverflow.ellipsis),
                          onDeleted: () {
                            setState(() {
                              selectedServicePhotos.removeAt(index);
                            });
                          },
                        );
                      }),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  if (explanationController.text.isEmpty) {
                    Get.snackbar('Error', 'Job explanation harus diisi');
                    return;
                  }
                  if (selectedServicePhotos.isEmpty) {
                    Get.snackbar('Error', 'Bukti foto/video service wajib diupload');
                    return;
                  }
                  Get.back();
                  controller.addJobExplanation(
                    explanationController.text,
                    selectedStatus,
                    servicePhotoPaths:
                        selectedServicePhotos.map((e) => e.path).toList(),
                  );
                },
                child: const Text('Submit'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showAddLaborDialog(
      BuildContext context, WoDetailController controller) async {
    List<String> picOptions = [];
    try {
      picOptions = await controller.getLaborPicOptions();
    } catch (e) {
      Get.snackbar(
        'Warning',
        'Daftar PIC belum bisa dimuat, gunakan input manual',
        snackPosition: SnackPosition.BOTTOM,
      );
    }

    String? selectedPic = picOptions.isNotEmpty ? picOptions.first : null;
    final tradeController = TextEditingController(text: selectedPic ?? '');
    final menController = TextEditingController(text: '1');
    final hoursController = TextEditingController(text: '1');

    List<String> selectedPics = [];

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Add Labor'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (picOptions.isNotEmpty)
                  MultiSelectDialogField<String>(
                    title: const Text("Pilih PIC"),
                    searchable: true,
                    items: picOptions
                        .map((e) => MultiSelectItem<String>(e, e))
                        .toList(),
                    initialValue: selectedPics,
                    buttonText: const Text("Pilih PIC"),
                    onConfirm: (values) {
                      if (values.length > 10) {
                        Get.snackbar("Warning", "Maksimal 10 user");
                        return;
                      }

                      setState(() {
                        selectedPics = values;
                        tradeController.text = values.join(",");
                      });
                    },
                    chipDisplay: MultiSelectChipDisplay(
                      onTap: (value) {
                        setState(() {
                          selectedPics.remove(value);
                          tradeController.text = selectedPics.join(",");
                        });
                      },
                    ),
                  )
                else
                  TextField(
                    controller: tradeController,
                    decoration: const InputDecoration(
                      labelText: 'PIC',
                      border: OutlineInputBorder(),
                    ),
                  ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: menController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Men',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: hoursController,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Hours',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  final picRaw = tradeController.text.trim();
                  final pics = picRaw
                      .split(',')
                      .map((value) => value.trim())
                      .where((value) => value.isNotEmpty)
                      .toSet()
                      .toList();
                  if (pics.isEmpty) {
                    Get.snackbar('Error', 'PIC harus dipilih');
                    return;
                  }
                  if (pics.length > 10) {
                    Get.snackbar('Error', 'Maksimal 10 PIC');
                    return;
                  }
                  Get.back();
                  controller.addLabor(
                    pics.join(','),
                    int.tryParse(menController.text) ?? 1,
                    double.tryParse(
                          hoursController.text.trim().replaceAll(',', '.'),
                        ) ??
                        1,
                  );
                },
                child: const Text('Add'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showAddMaterialDialog(
      BuildContext context, WoDetailController controller) {
    RequestPartDialog.show(onRequest: controller.requestPart);
  }

  void _showCompleteDialog(
      BuildContext context, WoDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Complete Work Order'),
        content: TextField(
          controller: commentController,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Comment',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.completeWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.blue),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
  }

  void _showCloseDialog(BuildContext context, WoDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Close Work Order'),
        content: TextField(
          controller: commentController,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Comment',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.closeWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  void _showVoidDialog(BuildContext context, WoDetailController controller) {
    final reasonController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Void Work Order'),
        content: TextField(
          controller: reasonController,
          decoration: const InputDecoration(
            labelText: 'Reason *',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (reasonController.text.isEmpty) {
                Get.snackbar('Error', 'Reason is required');
                return;
              }
              Get.back();
              controller.voidWo(reasonController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Void'),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusMessage(WoDetailController controller) {
    final status = controller.woHeader['status'] ?? '';

    String message = '';
    Color bgColor = Colors.blue;
    IconData icon = Icons.info_outline;

    if (status.contains('WAIT_EXECUTOR') || status == 'WAIT_EXECUTOR_ADMIN') {
      message = 'Menunggu executor untuk memulai pekerjaan';
      bgColor = Colors.orange;
      icon = Icons.hourglass_empty;
    } else if (status.contains('IN_PROGRESS') ||
        status == 'COMPLETE_EXECUTOR') {
      message = 'Pekerjaan sedang dalam pengerjaan oleh executor';
      bgColor = Colors.blue;
      icon = Icons.engineering;
    } else if (status.contains('WAIT_KA')) {
      message = 'Menunggu approval dari atasan';
      bgColor = Colors.amber;
      icon = Icons.pending_actions;
    } else if (status == 'NEED_CLOSED') {
      message = 'Menunggu penutupan oleh Kadiv';
      bgColor = Colors.green;
      icon = Icons.task_alt;
    } else if (status == 'CLOSED') {
      return const SizedBox();
    } else {
      return const SizedBox();
    }

    return Card(
      color: bgColor.withOpacity(0.9),
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderCard(WoDetailController controller) {
    final header = controller.woHeader;
    final assetName =
        (header['AssetName'] ?? header['asset_name'] ?? '-').toString().trim();
    final title = (header['job_title'] ?? '-').toString();
    final status = (header['status'] ?? '').toString();
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.05),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(assetName.isEmpty ? '-' : assetName,
                          style: const TextStyle(
                              fontSize: 22, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 6),
                      Text(title,
                          style: TextStyle(
                              fontSize: 14, color: AppColors.textSecondary)),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: _statusBackground(status),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _statusLabel(status),
                    style: TextStyle(
                      color: _statusColor(status),
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Row(children: [
              Icon(Icons.calendar_today, size: 14, color: AppColors.grey),
              const SizedBox(width: 6),
              Text(_formatDate((header['date'] ?? '').toString()),
                  style:
                      TextStyle(fontSize: 12, color: AppColors.textSecondary)),
              const SizedBox(width: 10),
              Expanded(
                child: Text((header['wo_number'] ?? '').toString(),
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 12, color: AppColors.textSecondary)),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  Color _statusColor(String status) {
    final value = status.toUpperCase();
    if (value.contains('VOID') || value.contains('DECLINE')) return Colors.red;
    if (value.contains('CLOSE') || value.contains('COMPLETE')) {
      return const Color(0xFF15803D);
    }
    if (value.contains('PROGRESS')) return const Color(0xFF1D4ED8);
    return const Color(0xFFB45309);
  }

  Color _statusBackground(String status) =>
      _statusColor(status).withOpacity(0.12);

  String _statusLabel(String status) =>
      status.trim().isEmpty ? '-' : status.replaceAll('_', ' ');

  Widget _buildDetailsCard(WoDetailController controller) {
    final header = controller.woHeader;
    return _buildSimpleInfoCard(
      title: 'Job Details',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildJobDetailField(
              'Job Title', header['job_title']?.toString() ?? ''),
          const SizedBox(height: 10),
          _buildJobDetailField(
              'Job Requirement', header['job_requirement']?.toString() ?? ''),
          if ((header['job_explanation'] ?? '')
              .toString()
              .trim()
              .isNotEmpty) ...[
            const SizedBox(height: 10),
            _buildJobDetailField(
                'Job Explanation', header['job_explanation'].toString()),
          ],
        ],
      ),
    );
  }

  Widget _buildJobDetailField(String label, String value) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        const SizedBox(height: 4),
        Text(value.trim().isEmpty ? '-' : value,
            style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
      ],
    );
  }

  Widget _buildServicePhotosCard(WoDetailController controller) {
    return Obx(() {
      final raw = controller.woDetail.value?['service_photos'];
      if (raw is! List || raw.isEmpty) return const SizedBox();

      final items = raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .where((e) => (e['url'] ?? '').toString().trim().isNotEmpty)
          .toList(growable: false);

      if (items.isEmpty) return const SizedBox();

      return CustomCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Bukti Foto/Video Service',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.greyLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${items.length}',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 110,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final url =
                      ApiConstants.mediaUrl(items[index]['url']?.toString());
                  final isVideo = MediaPickerHelper.isVideo(url);
                  return InkWell(
                    onTap: () => isVideo
                        ? Get.to(() => VideoPlayerPage(
                              title: items[index]['name']?.toString() ??
                                  'Video',
                              networkUrl: url,
                            ))
                        : _showImagePreview(url),
                    borderRadius: BorderRadius.circular(12),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: AspectRatio(
                        aspectRatio: 1.3,
                        child: isVideo
                            ? Container(
                                color: Colors.black87,
                                child: const Center(
                                  child: Icon(
                                    Icons.play_circle_fill,
                                    color: Colors.white,
                                    size: 36,
                                  ),
                                ),
                              )
                            : Image.network(
                                url,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  color: AppColors.greyLight,
                                  child: const Center(
                                    child: Icon(Icons.broken_image),
                                  ),
                                ),
                                loadingBuilder: (context, child, progress) {
                                  if (progress == null) return child;
                                  return Container(
                                    color: AppColors.greyLight,
                                    child: const Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      );
    });
  }

  void _showImagePreview(String url) {
    final safeUrl = url.trim();
    if (safeUrl.isEmpty) return;

    Get.dialog(
      Dialog(
        backgroundColor: Colors.transparent,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            color: Colors.black,
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4,
              child: Image.network(
                safeUrl,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 220,
                  child: Center(
                    child: Text(
                      'Gagal memuat gambar',
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildExecutorsCard(WoDetailController controller) {
    final executors = controller.executors;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Executor',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          if (executors.isEmpty)
            Text(
              'Belum ada executor',
              style: TextStyle(color: AppColors.textSecondary),
            )
          else
            ...executors.map((executor) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Icon(Icons.person,
                          size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          executor['job_executor'] ?? '',
                          style: TextStyle(
                            fontSize: 14,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.info.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          executor['status'] ?? '',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.info,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }

  Widget _buildLaborCard(WoDetailController controller) {
    final labor = controller.labor;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Labor',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          ...labor.map((item) {
            final String tradeText;
            final String menHoursText;

            if (item is Map) {
              tradeText = (item['trade'] ?? '-').toString();
              final men = (item['men'] ?? 0).toString();
              final hours = (item['hours'] ?? 0).toString();
              menHoursText = '$men men | $hours h';
            } else {
              tradeText = item.toString();
              menHoursText = '';
            }

            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      tradeText.isEmpty ? '-' : tradeText,
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  if (menHoursText.isNotEmpty)
                    Text(
                      menHoursText,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildMaterialCard(WoDetailController controller) {
    final material = controller.material;
    final materialRequests = controller.materialRequests;
    final partRequests = controller.partRequests;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Material',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          if (partRequests.isNotEmpty) ...[
            const Text(
              'Permintaan Part',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            ...partRequests.map((item) {
              final row = item is Map ? item : <String, dynamic>{};
              final status = (row['status'] ?? '-').toString();
              final note = (row['request_note'] ?? '').toString().trim();
              final requester = (row['requested_by_name'] ?? '-').toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.pending_actions_outlined,
                        size: 18, color: Color(0xFFF59E0B)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Status: $status',
                              style: const TextStyle(
                                  fontSize: 13, fontWeight: FontWeight.w700)),
                          Text('Requester: $requester',
                              style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.textSecondary)),
                          if (note.isNotEmpty)
                            Text(note,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: AppColors.textSecondary)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            }),
            if (material.isNotEmpty || materialRequests.isNotEmpty)
              const Divider(height: 20),
          ],
          if (material.isNotEmpty) ...[
            ...material.map((item) {
              final String materialName;
              final String qtyText;

              if (item is Map) {
                materialName = (item['material'] ?? '-').toString();
                final qty = (item['qty'] ?? 0).toString();
                final unit = (item['unit'] ?? '').toString();
                qtyText = '$qty $unit'.trim();
              } else {
                materialName = item.toString();
                qtyText = '';
              }

              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        materialName.isEmpty ? '-' : materialName,
                        style: TextStyle(
                          fontSize: 14,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    if (qtyText.isNotEmpty)
                      Text(
                        qtyText,
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                  ],
                ),
              );
            }),
          ],
          if (materialRequests.isNotEmpty) ...[
            if (material.isNotEmpty) const Divider(height: 20),
            Text(
              'Material Request / Receive',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            ...materialRequests.map((item) {
              if (item is! Map) {
                final text = item.toString().trim();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    text.isEmpty ? '-' : text,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                );
              }

              final part = (item['part'] ?? '-').toString();
              final reqQty = (item['material_request'] ?? 0).toString();
              final reqUom = (item['uom_request'] ?? '').toString();
              final recQty = (item['material_receive'] ?? 0).toString();
              final recUom =
                  ((item['uom_receive'] ?? item['uom_request']) ?? '')
                      .toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      part,
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Request: $reqQty $reqUom',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    Text(
                      'Receive: $recQty $recUom',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          if (material.isEmpty &&
              materialRequests.isEmpty &&
              partRequests.isEmpty)
            Text(
              'No material records',
              style: TextStyle(color: AppColors.textSecondary),
            ),
        ],
      ),
    );
  }

  String _formatDate(String date) {
    return formatDisplayDate(date);
  }
}
