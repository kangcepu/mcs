import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import 'dart:io';
import '../controllers/wo_mtc_create_controller.dart';
import '../../../data/models/wo_constants.dart';
import '../../../core/constants/app_colors.dart';

class WoMtcCreatePage extends StatelessWidget {
  const WoMtcCreatePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(WoMtcCreateController());

    return Scaffold(
      backgroundColor: AppColors.greyLight,
      appBar: AppBar(
        title: const Text('Buat Work Order'),
        elevation: 0,
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

        return Form(
          key: controller.formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildSectionCard(
                title: 'Informasi Dasar',
                icon: Icons.info_outline,
                children: [
                  _buildWoNumberField(controller),
                  const SizedBox(height: 16),
                  _buildDateField(controller, context),
                  const SizedBox(height: 16),
                  _buildTypeWoField(controller),
                  const SizedBox(height: 16),
                  _buildPriorityField(controller),
                  const SizedBox(height: 16),
                  _buildShiftField(controller),
                ],
              ),
              const SizedBox(height: 16),
              _buildSectionCard(
                title: 'Asset & Company',
                icon: Icons.business_outlined,
                children: [
                  _buildAssetField(controller),
                  const SizedBox(height: 16),
                  _buildCompanyField(controller),
                ],
              ),
              const SizedBox(height: 16),
              _buildSectionCard(
                title: 'Detail Pekerjaan',
                icon: Icons.work_outline,
                children: [
                  _buildJobTitleField(controller),
                  const SizedBox(height: 16),
                  _buildRunningHoursField(controller),
                  const SizedBox(height: 16),
                  _buildJobRequirementField(controller),
                ],
              ),
              const SizedBox(height: 16),
              _buildSectionCard(
                title: 'Attachment',
                icon: Icons.attach_file,
                children: [
                  _buildImagePicker(controller),
                ],
              ),
              const SizedBox(height: 24),
              _buildSubmitButton(controller),
              const SizedBox(height: 32),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
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
                  child: Icon(icon, color: AppColors.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: AppColors.textPrimary,
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

  Widget _buildSubmitButton(WoMtcCreateController controller) {
    return Obx(() => Container(
          height: 56,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            gradient: LinearGradient(
              colors: controller.isSubmitting.value
                  ? [AppColors.grey, AppColors.grey]
                  : [AppColors.primary, AppColors.primaryDark],
            ),
            boxShadow: controller.isSubmitting.value
                ? []
                : [
                    BoxShadow(
                      color: AppColors.primary.withOpacity(0.3),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
          ),
          child: ElevatedButton(
            onPressed:
                controller.isSubmitting.value ? null : controller.submitWo,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.transparent,
              shadowColor: Colors.transparent,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            child: controller.isSubmitting.value
                ? Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      SpinKitThreeBounce(
                        color: Colors.white,
                        size: 20,
                      ),
                      const SizedBox(width: 12),
                      const Text(
                        'Memproses...',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  )
                : Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: const [
                      Icon(Icons.check_circle_outline, size: 24),
                      SizedBox(width: 12),
                      Text(
                        'Buat Work Order',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
          ),
        ));
  }

  Widget _buildWoNumberField(WoMtcCreateController controller) {
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
                    padding: EdgeInsets.all(12.0),
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
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          readOnly: true,
        ));
  }

  Widget _buildDateField(WoMtcCreateController controller, BuildContext context) {
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

  Widget _buildAssetField(WoMtcCreateController controller) {
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
        Obx(() => InkWell(
              onTap: () {
                final context = Get.context;
                if (context != null) {
                  controller.showAssetSelectionDialog(context);
                }
              },
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
                      color: controller.selectedAsset.value != null
                          ? AppColors.primary
                          : Colors.grey.shade500,
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        controller.selectedAsset.value?['AssetName'] ?? 'Select Asset',
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w500,
                          color: controller.selectedAsset.value != null
                              ? Colors.black87
                              : Colors.grey.shade600,
                        ),
                      ),
                    ),
                    Icon(
                      Icons.arrow_drop_down,
                      color: Colors.grey.shade500,
                    ),
                  ],
                ),
              ),
            )),
      ],
    );
  }

  Widget _buildCompanyField(WoMtcCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
          key: ValueKey(controller.selectedCompany.value),
          value: controller.selectedCompany.value,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.black87,
          ),
          decoration: InputDecoration(
            labelText: 'Company *',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.business, size: 22),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          hint: const Text('Select Company'),
          items: controller.companies.map((company) {
            return DropdownMenuItem<String>(
              value: company['label'],
              child: Text(company['label']),
            );
          }).toList(),
          onChanged: (value) {
            if (value != null) {
              controller.selectedCompany.value = value;
              controller.companyController.text = value;
            }
          },
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Company must be selected';
            }
            return null;
          },
        ));
  }

  Widget _buildTypeWoField(WoMtcCreateController controller) {
    return Obx(() => DropdownButtonFormField<WoType>(
          value: controller.selectedTypeWo.value,
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
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          hint: const Text('Select Type'),
          items: controller.woTypes.map((type) {
            final woType = WoType.fromCode(type['code']);
            return DropdownMenuItem(
              value: woType,
              child: Text(type['label'] ?? type['code']),
            );
          }).toList(),
          onChanged: (value) => controller.selectedTypeWo.value = value,
          validator: (value) {
            if (value == null) return 'Type WO must be selected';
            return null;
          },
        ));
  }

  Widget _buildPriorityField(WoMtcCreateController controller) {
    return Obx(() => DropdownButtonFormField<WoPriority>(
          value: controller.selectedPriority.value,
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
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          hint: const Text('Select Priority'),
          items: controller.priorities.map((priority) {
            final woPriority = WoPriority.fromCode(priority['code']);
            return DropdownMenuItem(
              value: woPriority,
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: _getPriorityColor(priority['code']),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(priority['label'] ?? priority['code']),
                ],
              ),
            );
          }).toList(),
          onChanged: (value) => controller.selectedPriority.value = value,
          validator: (value) {
            if (value == null) return 'Priority must be selected';
            return null;
          },
        ));
  }

  Widget _buildShiftField(WoMtcCreateController controller) {
    return DropdownButtonFormField<String>(
      value: controller.shiftController.text.isNotEmpty
          ? controller.shiftController.text
          : null,
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
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      hint: const Text('Select Shift'),
      items: const [
        DropdownMenuItem(value: 'Regular', child: Text('Regular')),
        DropdownMenuItem(value: 'Shift 1', child: Text('Shift 1')),
        DropdownMenuItem(value: 'Shift 2', child: Text('Shift 2')),
        DropdownMenuItem(value: 'Shift 3', child: Text('Shift 3')),
      ],
      onChanged: (value) {
        if (value != null) {
          controller.shiftController.text = value;
        }
      },
    );
  }

  Widget _buildJobTitleField(WoMtcCreateController controller) {
    return TextFormField(
      controller: controller.jobTitleController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Job Title *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.work, size: 22),
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

  Widget _buildRunningHoursField(WoMtcCreateController controller) {
    return TextFormField(
      controller: controller.runningHoursController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Running Hours',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.timer, size: 22),
        hintText: 'e.g. 1000',
        hintStyle: TextStyle(color: Colors.grey[400]),
        suffix: const Text('hrs', style: TextStyle(fontSize: 13)),
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

  Widget _buildJobRequirementField(WoMtcCreateController controller) {
    return TextFormField(
      controller: controller.jobRequirementController,
      style: const TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
      ),
      decoration: InputDecoration(
        labelText: 'Job Requirement *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.description, size: 22),
        alignLabelWithHint: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      maxLines: 4,
      validator: (value) => controller.validateRequired(value, 'Job Requirement'),
    );
  }

  Widget _buildImagePicker(WoMtcCreateController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Obx(() {
          if (controller.selectedImages.isEmpty) {
            return InkWell(
              onTap: controller.pickImages,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                height: 140,
                decoration: BoxDecoration(
                  color: Colors.grey[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Colors.grey.shade300,
                    width: 1.5,
                    style: BorderStyle.solid,
                  ),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.add_photo_alternate_outlined,
                          size: 36,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'Add Photos',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Maximum 5 photos',
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }

          return GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            itemCount: controller.selectedImages.length + 1,
            itemBuilder: (context, index) {
              if (index == controller.selectedImages.length) {
                if (controller.selectedImages.length < 5) {
                  return InkWell(
                    onTap: controller.pickImages,
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.grey[50],
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: Colors.grey.shade300,
                          width: 1.5,
                        ),
                      ),
                      child: Icon(
                        Icons.add_rounded,
                        size: 32,
                        color: AppColors.primary,
                      ),
                    ),
                  );
                }
                return const SizedBox();
              }

              return Stack(
                children: [
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      image: DecorationImage(
                        image: FileImage(controller.selectedImages[index]),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  Positioned(
                    top: 6,
                    right: 6,
                    child: InkWell(
                      onTap: () => controller.removeImage(index),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.7),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(
                          Icons.close_rounded,
                          color: Colors.white,
                          size: 18,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          );
        }),
      ],
    );
  }

  Color _getPriorityColor(String code) {
    switch (code) {
      case 'NORMAL':
        return Colors.green;
      case 'EMERGENCY':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }
}
