import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'package:get/get.dart';

import '../../../core/constants/app_colors.dart';
import '../controllers/wo_operational_create_controller.dart';

class WoOperationalCreatePage extends GetView<WoOperationalCreateController> {
  const WoOperationalCreatePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text(
          'Create Work Order',
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        elevation: 0,
        actions: [
          Obx(() {
            if (controller.isSubmitting.value) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: Colors.white,
                  ),
                ),
              );
            }
            return IconButton(
              icon: const Icon(Icons.check_rounded, size: 26),
              onPressed: controller.submitWo,
              tooltip: 'Submit',
            );
          }),
        ],
      ),
      body: Obx(() {
        if (controller.isLoadingMaster.value) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SpinKitFadingCircle(
                  color: AppColors.primary,
                  size: 50,
                ),
                const SizedBox(height: 16),
                Text(
                  'Loading master data...',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          );
        }

        return Stack(
          children: [
            Form(
              key: controller.formKey,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  _buildSectionCard(
                    title: 'Basic Information',
                    icon: Icons.info_outline,
                    children: [
                      _buildWoNumberField(),
                      const SizedBox(height: 16),
                      _buildDateField(context),
                      const SizedBox(height: 16),
                      _buildDivisionField(),
                      const SizedBox(height: 16),
                      _buildAssetField(context),
                      const SizedBox(height: 16),
                      _buildCompanyField(),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _buildSectionCard(
                    title: 'Work Order Details',
                    icon: Icons.settings_outlined,
                    children: [
                      _buildTypeWoField(),
                      const SizedBox(height: 16),
                      _buildPriorityField(),
                      const SizedBox(height: 16),
                      _buildShiftField(),
                      const SizedBox(height: 16),
                      _buildJobTitleField(),
                      const SizedBox(height: 16),
                      _buildRunningHoursField(),
                      const SizedBox(height: 16),
                      _buildJobRequirementField(),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _buildSectionCard(
                    title: 'Attachments',
                    icon: Icons.attach_file,
                    children: [
                      _buildAttachmentField(),
                    ],
                  ),
                  const SizedBox(height: 100),
                ],
              ),
            ),
            if (controller.isSubmitting.value)
              Container(
                color: Colors.black45,
                child: Center(
                  child: Card(
                    elevation: 8,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: const [
                          CircularProgressIndicator(strokeWidth: 3),
                          SizedBox(height: 20),
                          Text(
                            'Creating Work Order...',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      }),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    icon,
                    size: 20,
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildWoNumberField() {
    return Obx(() => TextFormField(
          controller: controller.woNumberController,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            labelText: 'WO Number',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.tag, size: 22),
            suffixIcon: controller.isGeneratingNumber.value
                ? const Padding(
                    padding: EdgeInsets.all(12),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    ),
                  )
                : IconButton(
                    icon: const Icon(Icons.refresh_rounded),
                    onPressed: controller.generateWoNumber,
                    tooltip: 'Generate',
                  ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          readOnly: true,
        ));
  }

  Widget _buildDateField(BuildContext context) {
    return TextFormField(
      controller: controller.dateController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Date *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.calendar_today, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      readOnly: true,
      onTap: () => controller.pickDate(context),
      validator: (value) => controller.validateRequired(value, 'Date'),
    );
  }

  Widget _buildDivisionField() {
    return Obx(() {
      final division = controller.selectedDivision.value;
      final divisionName = (division?['division_name'] ?? '-').toString();

      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.grey[50],
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            const Icon(Icons.corporate_fare, size: 22),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Division',
                    style: TextStyle(fontSize: 12, color: Colors.black54),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    divisionName,
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    });
  }

  Widget _buildAssetField(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Asset/Equipment *',
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w600,
            color: Colors.black87,
          ),
        ),
        const SizedBox(height: 8),
        Obx(() {
          final selected = controller.selectedAsset.value;
          final assetName = (selected?['AssetName'] ?? 'Select Asset').toString();
          final assetCode = (selected?['AssetCode'] ?? '').toString();

          return InkWell(
            onTap: () => controller.showAssetSelectionDialog(context),
            borderRadius: BorderRadius.circular(12),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.precision_manufacturing,
                    size: 22,
                    color: selected != null ? AppColors.primary : Colors.grey,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          assetName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight:
                                selected != null ? FontWeight.w600 : FontWeight.w500,
                            color: selected != null
                                ? Colors.black87
                                : Colors.grey.shade600,
                          ),
                        ),
                        if (assetCode.isNotEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 2),
                            child: Text(
                              assetCode,
                              style: const TextStyle(
                                fontSize: 12,
                                color: Colors.black54,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  Icon(Icons.arrow_drop_down, color: Colors.grey.shade500),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  Widget _buildCompanyField() {
    return TextFormField(
      controller: controller.companyController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: Colors.black87,
      ),
      readOnly: true,
      decoration: InputDecoration(
        labelText: 'Company *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.business, size: 22),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[100],
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      validator: (value) => controller.validateRequired(value, 'Company'),
    );
  }

  Widget _buildTypeWoField() {
    return Obx(
      () => DropdownButtonFormField<String>(
        value: controller.selectedTypeWo.value.isEmpty
            ? null
            : controller.selectedTypeWo.value,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: Colors.black87,
        ),
        decoration: InputDecoration(
          labelText: 'Type WO *',
          labelStyle: const TextStyle(fontSize: 14),
          prefixIcon: const Icon(Icons.category, size: 22),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          filled: true,
          fillColor: Colors.grey[50],
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
        hint: const Text('Select Type'),
        items: controller.woTypes.map((type) {
          final code = (type['code'] ?? '').toString();
          final label = (type['label'] ?? code).toString();
          return DropdownMenuItem<String>(
            value: code,
            child: Text(label),
          );
        }).toList(),
        onChanged: (value) {
          if (value != null) {
            controller.selectedTypeWo.value = value;
          }
        },
        validator: (value) {
          if (value == null || value.trim().isEmpty) {
            return 'Type WO must be selected';
          }
          return null;
        },
      ),
    );
  }

  Widget _buildPriorityField() {
    return Obx(
      () => DropdownButtonFormField<String>(
        value: controller.selectedPriority.value.isEmpty
            ? null
            : controller.selectedPriority.value,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: Colors.black87,
        ),
        decoration: InputDecoration(
          labelText: 'Priority *',
          labelStyle: const TextStyle(fontSize: 14),
          prefixIcon: const Icon(Icons.priority_high, size: 22),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          filled: true,
          fillColor: Colors.grey[50],
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
        hint: const Text('Select Priority'),
        items: controller.priorities.map((priority) {
          final code = (priority['code'] ?? '').toString();
          final label = (priority['label'] ?? code).toString();
          return DropdownMenuItem<String>(
            value: code,
            child: Text(label),
          );
        }).toList(),
        onChanged: (value) {
          if (value != null) {
            controller.selectedPriority.value = value;
          }
        },
        validator: (value) {
          if (value == null || value.trim().isEmpty) {
            return 'Priority must be selected';
          }
          return null;
        },
      ),
    );
  }

  Widget _buildShiftField() {
    return Obx(
      () => DropdownButtonFormField<String>(
        value: controller.selectedShift.value,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: Colors.black87,
        ),
        decoration: InputDecoration(
          labelText: 'Shift',
          labelStyle: const TextStyle(fontSize: 14),
          prefixIcon: const Icon(Icons.access_time, size: 22),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          filled: true,
          fillColor: Colors.grey[50],
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
        items: const [
          DropdownMenuItem(value: 'regular', child: Text('Regular')),
          DropdownMenuItem(value: 'shift 1', child: Text('Shift 1')),
          DropdownMenuItem(value: 'shift 2', child: Text('Shift 2')),
          DropdownMenuItem(value: 'shift 3', child: Text('Shift 3')),
        ],
        onChanged: (value) {
          if (value != null) {
            controller.selectedShift.value = value;
          }
        },
      ),
    );
  }

  Widget _buildJobTitleField() {
    return TextFormField(
      controller: controller.jobTitleController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Job Title *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.title, size: 22),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      maxLines: 2,
      validator: (value) => controller.validateRequired(value, 'Job Title'),
    );
  }

  Widget _buildRunningHoursField() {
    return TextFormField(
      controller: controller.runningHoursController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Running Hours',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.speed, size: 22),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      keyboardType: TextInputType.number,
      validator: (value) => controller.validateNumber(value, 'Running Hours'),
    );
  }

  Widget _buildJobRequirementField() {
    return TextFormField(
      controller: controller.jobRequirementController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Job Requirement *',
        labelStyle: const TextStyle(fontSize: 14),
        alignLabelWithHint: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.all(16),
      ),
      maxLines: 4,
      validator: (value) => controller.validateRequired(value, 'Job Requirement'),
    );
  }

  Widget _buildAttachmentField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: const [
            Icon(Icons.attach_file, size: 18, color: Colors.black54),
            SizedBox(width: 8),
            Text(
              'Lampiran Foto (Optional)',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.black54,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Obx(
          () => Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              ...controller.selectedImages.asMap().entries.map((entry) {
                return Stack(
                  children: [
                    Container(
                      width: 90,
                      height: 90,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(12),
                        image: DecorationImage(
                          image: FileImage(entry.value),
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: GestureDetector(
                        onTap: () => controller.removeImage(entry.key),
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 16,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              }),
              if (controller.selectedImages.length < 5)
                GestureDetector(
                  onTap: controller.pickImages,
                  child: Container(
                    width: 90,
                    height: 90,
                    decoration: BoxDecoration(
                      color: Colors.grey[100],
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Colors.grey.shade400,
                        width: 1.5,
                      ),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: const [
                        Icon(Icons.add_photo_alternate, size: 30),
                        SizedBox(height: 4),
                        Text(
                          'Tambah',
                          style: TextStyle(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}
