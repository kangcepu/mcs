import 'dart:io';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';
import '../../../data/models/work_order_model.dart' as wo_model;
import '../../../data/repositories/wo_operational_repository.dart';

class WoOperationalUpdateController extends GetxController {
  final WoOperationalRepository _woRepository = WoOperationalRepository();
  final ImagePicker _picker = ImagePicker();
  
  final formKey = GlobalKey<FormState>();
  
  final woNumberController = TextEditingController();
  final dateController = TextEditingController();
  final companyController = TextEditingController();
  final shiftController = TextEditingController();
  final typeWoController = TextEditingController();
  final priorityController = TextEditingController();
  final idDivisionController = TextEditingController();
  final idEquipmentController = TextEditingController();
  final jobTitleController = TextEditingController();
  final runningHoursController = TextEditingController();
  final jobRequirementController = TextEditingController();
  final categoryMaintenanceController = TextEditingController();
  
  final Rx<File?> attachmentFile = Rx<File?>(null);
  final attachmentPath = ''.obs;
  final existingAttachment = ''.obs;
  final isLoading = false.obs;
  
  final Rx<wo_model.WorkOrder?> workOrder = Rx<wo_model.WorkOrder?>(null);

  @override
  void onInit() {
    super.onInit();
    workOrder.value = Get.arguments as wo_model.WorkOrder?;
    if (workOrder.value != null) {
      populateForm();
    }
  }

  @override
  void onClose() {
    woNumberController.dispose();
    dateController.dispose();
    companyController.dispose();
    shiftController.dispose();
    typeWoController.dispose();
    priorityController.dispose();
    idDivisionController.dispose();
    idEquipmentController.dispose();
    jobTitleController.dispose();
    runningHoursController.dispose();
    jobRequirementController.dispose();
    categoryMaintenanceController.dispose();
    super.onClose();
  }

  void populateForm() {
    final wo = workOrder.value!;
    woNumberController.text = wo.woNumber;
    dateController.text = wo.date;
    companyController.text = wo.company;
    shiftController.text = wo.shift;
    typeWoController.text = wo.typeWo;
    priorityController.text = wo.priority;
    idDivisionController.text = wo.idDivision;
    idEquipmentController.text = wo.idEquipment;
    jobTitleController.text = wo.jobTitle;
    runningHoursController.text = wo.runningHours;
    jobRequirementController.text = wo.jobRequirement;
    categoryMaintenanceController.text = wo.categoryMaintenance ?? '';
    existingAttachment.value = wo.attachment ?? '';
  }

  Future<void> pickImage() async {
    try {
      final XFile? image = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
      );
      
      if (image != null) {
        attachmentFile.value = File(image.path);
        attachmentPath.value = image.path;
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to pick image: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  Future<void> takePhoto() async {
    try {
      final XFile? photo = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 80,
      );
      
      if (photo != null) {
        attachmentFile.value = File(photo.path);
        attachmentPath.value = photo.path;
      }
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to take photo: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    }
  }

  void removeAttachment() {
    attachmentFile.value = null;
    attachmentPath.value = '';
    existingAttachment.value = '';
  }

  Future<void> updateWo() async {
    if (!formKey.currentState!.validate()) {
      return;
    }

    try {
      isLoading.value = true;
      
      await _woRepository.updateWo(
        woNumber: woNumberController.text,
        date: dateController.text,
        company: companyController.text,
        shift: shiftController.text,
        typeWo: typeWoController.text,
        priority: priorityController.text,
        idDivision: idDivisionController.text,
        idEquipment: idEquipmentController.text,
        jobTitle: jobTitleController.text,
        runningHours: runningHoursController.text,
        jobRequirement: jobRequirementController.text,
        categoryMaintenance: categoryMaintenanceController.text.isEmpty 
            ? null 
            : categoryMaintenanceController.text,
        attachmentPath: attachmentPath.value.isEmpty 
            ? null 
            : attachmentPath.value,
      );
      
      Get.snackbar(
        'Success',
        'WO updated successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      
      Get.back(result: true);
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to update WO: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  Future<void> updateAsset(String equipmentId) async {
    try {
      isLoading.value = true;
      
      await _woRepository.updateAsset(
        woNumber: woNumberController.text,
        idEquipment: equipmentId,
      );
      
      idEquipmentController.text = equipmentId;
      
      Get.snackbar(
        'Success',
        'Asset updated successfully',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.green,
        colorText: Colors.white,
      );
      
    } catch (e) {
      Get.snackbar(
        'Error',
        'Failed to update asset: ${e.toString()}',
        snackPosition: SnackPosition.BOTTOM,
        backgroundColor: Colors.red,
        colorText: Colors.white,
      );
    } finally {
      isLoading.value = false;
    }
  }

  void setCompany(String company) {
    companyController.text = company;
  }

  void setShift(String shift) {
    shiftController.text = shift;
  }

  void setTypeWo(String typeWo) {
    typeWoController.text = typeWo;
  }

  void setPriority(String priority) {
    priorityController.text = priority;
  }

  void setDivision(String divisionId) {
    idDivisionController.text = divisionId;
  }

  void setEquipment(String equipmentId) {
    idEquipmentController.text = equipmentId;
  }

  void setCategoryMaintenance(String category) {
    categoryMaintenanceController.text = category;
  }
}
