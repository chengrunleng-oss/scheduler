import { requiredElement } from "./dom.js";

export interface Elements {
  appShell: HTMLElement;
  sidebar: HTMLElement;
  sidebarClose: HTMLButtonElement;
  navToggle: HTMLButtonElement;
  globalNewTask: HTMLButtonElement;
  defaultDueDate: HTMLSelectElement;
  defaultPriority: HTMLSelectElement;
  recentWorklogDays: HTMLSelectElement;
  newFolder: HTMLButtonElement;
  folderTree: HTMLElement;
  workspaceTitle: HTMLElement;
  taskList: HTMLElement;
  emptyState: HTMLElement;
  dragHint: HTMLElement;
  searchInput: HTMLInputElement;
  statusFilters: NodeListOf<HTMLButtonElement>;
  viewModes: NodeListOf<HTMLButtonElement>;
  metricActive: HTMLElement;
  metricCompleted: HTMLElement;
  metricDiscarded: HTMLElement;
  metricDue: HTMLElement;
  exportData: HTMLButtonElement;
  importData: HTMLButtonElement;
  importHistory: HTMLButtonElement;
  importFile: HTMLInputElement;
  resetDemo: HTMLButtonElement;
  workspaceStorageStatus: HTMLElement;
  workspaceStorageIndicator: HTMLElement;
  chooseWorkspaceDirectory: HTMLButtonElement;
  reauthorizeWorkspaceDirectory: HTMLButtonElement;
  undoAction: HTMLButtonElement;
  redoAction: HTMLButtonElement;
  themeSelect: HTMLSelectElement;
  taskDetail: HTMLElement;
  detailResizer: HTMLElement;
  detailClose: HTMLButtonElement;
  detailEmpty: HTMLElement;
  zoomDescription: HTMLButtonElement;
  zoomDaily: HTMLButtonElement;
  zoomHistory: HTMLButtonElement;
  descriptionSection: HTMLElement;
  dailySection: HTMLElement;
  worklogHistorySection: HTMLElement;
  worklogDateDialog: HTMLDialogElement;
  worklogDateForm: HTMLFormElement;
  worklogDatePrompt: HTMLElement;
  worklogNewDate: HTMLInputElement;
  workspaceTabs: HTMLElement;
  workspaceTabButtons: NodeListOf<HTMLButtonElement>;
  workspaceContent: HTMLElement;
  workspacePanels: NodeListOf<HTMLElement>;
  detailForm: HTMLFormElement;
  detailStatusBadge: HTMLElement;
  detailTitle: HTMLTextAreaElement;
  detailNotes: HTMLTextAreaElement;
  detailPriority: HTMLSelectElement;
  detailFolder: HTMLSelectElement;
  detailDueDate: HTMLInputElement;
  detailTag: HTMLInputElement;
  detailRescheduleReason: HTMLInputElement;
  detailCreatedAt: HTMLElement;
  detailUpdatedAt: HTMLElement;
  timelineSection: HTMLElement;
  rescheduleTimeline: HTMLOListElement;
  cancelDetail: HTMLButtonElement;
  overviewSaveStatus: HTMLElement;
  descriptionSaveStatus: HTMLElement;
  descriptionRetry: HTMLButtonElement;
  descriptionEditor: HTMLElement;
  worklogDate: HTMLInputElement;
  worklogProgress: HTMLInputElement;
  worklogSaveStatus: HTMLElement;
  worklogRetry: HTMLButtonElement;
  worklogEditor: HTMLElement;
  worklogHistory: HTMLElement;
  newWorklog: HTMLButtonElement;
  worklogUndo: HTMLElement;
  worklogUndoText: HTMLElement;
  undoWorklogDelete: HTMLButtonElement;
  attachmentFile: HTMLInputElement;
  descriptionImportFile: HTMLInputElement;
  worklogImportFile: HTMLInputElement;
  addAttachment: HTMLButtonElement;
  openTaskFolder: HTMLButtonElement;
  attachmentsPanel: HTMLElement;
  attachmentDropHint: HTMLElement;
  importDescription: HTMLButtonElement;
  importWorklog: HTMLButtonElement;
  migrateEmbeddedImages: HTMLButtonElement;
  storageUsage: HTMLElement;
  storageProgress: HTMLProgressElement;
  attachmentList: HTMLElement;
  attachmentPreview: HTMLElement;
  attachmentRenameDialog: HTMLDialogElement;
  attachmentRenameForm: HTMLFormElement;
  attachmentRenameName: HTMLInputElement;
  folderDialog: HTMLDialogElement;
  folderDialogForm: HTMLFormElement;
  folderDialogTitle: HTMLElement;
  folderName: HTMLInputElement;
  folderParent: HTMLSelectElement;
  folderMoveDialog: HTMLDialogElement;
  folderMoveForm: HTMLFormElement;
  folderMoveName: HTMLElement;
  folderMoveParent: HTMLSelectElement;
  folderMovePosition: HTMLSelectElement;
  folderDeleteDialog: HTMLDialogElement;
  folderDeleteText: HTMLElement;
  folderDeleteMove: HTMLButtonElement;
  folderDeleteBranch: HTMLButtonElement;
  folderDeleteCancel: HTMLButtonElement;
  folderDeleteClose: HTMLButtonElement;
  confirmDialog: HTMLDialogElement;
  confirmTitle: HTMLElement;
  confirmText: HTMLElement;
  confirmClose: HTMLButtonElement;
  confirmCancel: HTMLButtonElement;
  confirmOk: HTMLButtonElement;
  workspaceSetupDialog: HTMLDialogElement;
  workspaceSetupImport: HTMLButtonElement;
  workspaceSetupEmpty: HTMLButtonElement;
  workspaceSetupCancel: HTMLButtonElement;
  conflictDialog: HTMLDialogElement;
  conflictText: HTMLElement;
  conflictClose: HTMLButtonElement;
  conflictReload: HTMLButtonElement;
  conflictCopy: HTMLButtonElement;
  conflictCancel: HTMLButtonElement;
  importCenterDialog: HTMLDialogElement;
  importCenterClose: HTMLButtonElement;
  importCenterCancel: HTMLButtonElement;
  importSourceName: HTMLElement;
  importSourceMeta: HTMLElement;
  importCompatibilityNote: HTMLElement;
  importSummary: HTMLElement;
  importFilters: HTMLElement;
  importBatchActions: HTMLElement;
  importBatchGroup: HTMLSelectElement;
  importBatchDecision: HTMLSelectElement;
  importBatchApply: HTMLButtonElement;
  importVisibleCount: HTMLElement;
  importItemList: HTMLElement;
  importReplaceRestore: HTMLButtonElement;
  importApplyMerge: HTMLButtonElement;
  importProgressDialog: HTMLDialogElement;
  importProgressStages: HTMLOListElement;
  importProgressText: HTMLElement;
  importProgressCancel: HTMLButtonElement;
  importResultDialog: HTMLDialogElement;
  importResultClose: HTMLButtonElement;
  importResultText: HTMLElement;
  importDownloadReport: HTMLButtonElement;
  importLocateChanges: HTMLButtonElement;
  importRollback: HTMLButtonElement;
  importResultDone: HTMLButtonElement;
  moveDialog: HTMLDialogElement;
  moveDialogForm: HTMLFormElement;
  moveFolder: HTMLSelectElement;
  movePriority: HTMLSelectElement;
  movePrevious: HTMLButtonElement;
  moveNext: HTMLButtonElement;
  moveRestriction: HTMLElement;
  moveSubmit: HTMLButtonElement;
  moveDelete: HTMLButtonElement;
  rescheduleDialog: HTMLDialogElement;
  rescheduleForm: HTMLFormElement;
  rescheduleDate: HTMLInputElement;
  rescheduleReason: HTMLInputElement;
  toast: HTMLElement;
  liveRegion: HTMLElement;
}

export function queryElements(): Elements {
  return {
    appShell: requiredElement("#appShell"),
    sidebar: requiredElement("#sidebar"), sidebarClose: requiredElement("#sidebarClose"), navToggle: requiredElement("#navToggle"),
    globalNewTask: requiredElement("#globalNewTask"), defaultDueDate: requiredElement("#defaultDueDate"), defaultPriority: requiredElement("#defaultPriority"), recentWorklogDays: requiredElement("#recentWorklogDays"),
    newFolder: requiredElement("#newFolder"), folderTree: requiredElement("#folderTree"), workspaceTitle: requiredElement("#workspaceTitle"),
    taskList: requiredElement("#taskList"), emptyState: requiredElement("#emptyState"), dragHint: requiredElement("#dragHint"), searchInput: requiredElement("#searchInput"),
    statusFilters: document.querySelectorAll(".status-segment"), viewModes: document.querySelectorAll(".view-segment"),
    metricActive: requiredElement("#metricActive"), metricCompleted: requiredElement("#metricCompleted"), metricDiscarded: requiredElement("#metricDiscarded"), metricDue: requiredElement("#metricDue"),
    exportData: requiredElement("#exportData"), importData: requiredElement("#importData"), importHistory: requiredElement("#importHistory"), importFile: requiredElement("#importFile"), resetDemo: requiredElement("#resetDemo"),
    workspaceStorageStatus: requiredElement("#workspaceStorageStatus"), workspaceStorageIndicator: requiredElement("#workspaceStorageIndicator"), chooseWorkspaceDirectory: requiredElement("#chooseWorkspaceDirectory"), reauthorizeWorkspaceDirectory: requiredElement("#reauthorizeWorkspaceDirectory"),
    undoAction: requiredElement("#undoAction"), redoAction: requiredElement("#redoAction"), themeSelect: requiredElement("#themeSelect"),
    taskDetail: requiredElement("#taskDetail"), detailResizer: requiredElement("#detailResizer"), detailClose: requiredElement("#detailClose"), detailEmpty: requiredElement("#detailEmpty"),
    zoomDescription: requiredElement("#zoomDescription"), zoomDaily: requiredElement("#zoomDaily"), zoomHistory: requiredElement("#zoomHistory"),
    descriptionSection: requiredElement("#descriptionSection"), dailySection: requiredElement("#dailySection"), worklogHistorySection: requiredElement("#worklogHistorySection"),
    worklogDateDialog: requiredElement("#worklogDateDialog"), worklogDateForm: requiredElement("#worklogDateForm"), worklogDatePrompt: requiredElement("#worklogDatePrompt"), worklogNewDate: requiredElement("#worklogNewDate"),
    workspaceTabs: requiredElement("#workspaceTabs"), workspaceTabButtons: document.querySelectorAll(".workspace-tab"), workspaceContent: requiredElement("#workspaceContent"), workspacePanels: document.querySelectorAll(".workspace-panel"), detailForm: requiredElement("#detailForm"),
    detailStatusBadge: requiredElement("#detailStatusBadge"), detailTitle: requiredElement("#detailTitle"), detailNotes: requiredElement("#detailNotes"),
    detailPriority: requiredElement("#detailPriority"), detailFolder: requiredElement("#detailFolder"), detailDueDate: requiredElement("#detailDueDate"),
    detailTag: requiredElement("#detailTag"), detailRescheduleReason: requiredElement("#detailRescheduleReason"), detailCreatedAt: requiredElement("#detailCreatedAt"),
    detailUpdatedAt: requiredElement("#detailUpdatedAt"), timelineSection: requiredElement("#timelineSection"), rescheduleTimeline: requiredElement("#rescheduleTimeline"), cancelDetail: requiredElement("#cancelDetail"),
    overviewSaveStatus: requiredElement("#overviewSaveStatus"), descriptionSaveStatus: requiredElement("#descriptionSaveStatus"), descriptionRetry: requiredElement("#descriptionRetry"), descriptionEditor: requiredElement("#descriptionEditor"),
    worklogDate: requiredElement("#worklogDate"), worklogProgress: requiredElement("#worklogProgress"), worklogSaveStatus: requiredElement("#worklogSaveStatus"), worklogRetry: requiredElement("#worklogRetry"), worklogEditor: requiredElement("#worklogEditor"), worklogHistory: requiredElement("#worklogHistory"),
    newWorklog: requiredElement("#newWorklog"), worklogUndo: requiredElement("#worklogUndo"), worklogUndoText: requiredElement("#worklogUndoText"), undoWorklogDelete: requiredElement("#undoWorklogDelete"),
    attachmentFile: requiredElement("#attachmentFile"), descriptionImportFile: requiredElement("#descriptionImportFile"), worklogImportFile: requiredElement("#worklogImportFile"), addAttachment: requiredElement("#addAttachment"), openTaskFolder: requiredElement("#openTaskFolder"), attachmentsPanel: requiredElement("#attachmentsPanel"), attachmentDropHint: requiredElement("#attachmentDropHint"), importDescription: requiredElement("#importDescription"), importWorklog: requiredElement("#importWorklog"), migrateEmbeddedImages: requiredElement("#migrateEmbeddedImages"),
    storageUsage: requiredElement("#storageUsage"), storageProgress: requiredElement("#storageProgress"), attachmentList: requiredElement("#attachmentList"), attachmentPreview: requiredElement("#attachmentPreview"), attachmentRenameDialog: requiredElement("#attachmentRenameDialog"), attachmentRenameForm: requiredElement("#attachmentRenameForm"), attachmentRenameName: requiredElement("#attachmentRenameName"),
    folderDialog: requiredElement("#folderDialog"), folderDialogForm: requiredElement("#folderDialogForm"), folderDialogTitle: requiredElement("#folderDialogTitle"),
    folderName: requiredElement("#folderName"), folderParent: requiredElement("#folderParent"), folderMoveDialog: requiredElement("#folderMoveDialog"), folderMoveForm: requiredElement("#folderMoveForm"), folderMoveName: requiredElement("#folderMoveName"), folderMoveParent: requiredElement("#folderMoveParent"), folderMovePosition: requiredElement("#folderMovePosition"), folderDeleteDialog: requiredElement("#folderDeleteDialog"),
    folderDeleteText: requiredElement("#folderDeleteText"), folderDeleteMove: requiredElement("#folderDeleteMove"), folderDeleteBranch: requiredElement("#folderDeleteBranch"),
    folderDeleteCancel: requiredElement("#folderDeleteCancel"), folderDeleteClose: requiredElement("#folderDeleteClose"), confirmDialog: requiredElement("#confirmDialog"),
    confirmTitle: requiredElement("#confirmTitle"), confirmText: requiredElement("#confirmText"), confirmClose: requiredElement("#confirmClose"),
    confirmCancel: requiredElement("#confirmCancel"), confirmOk: requiredElement("#confirmOk"), workspaceSetupDialog: requiredElement("#workspaceSetupDialog"), workspaceSetupImport: requiredElement("#workspaceSetupImport"), workspaceSetupEmpty: requiredElement("#workspaceSetupEmpty"), workspaceSetupCancel: requiredElement("#workspaceSetupCancel"), conflictDialog: requiredElement("#conflictDialog"), conflictText: requiredElement("#conflictText"),
    conflictClose: requiredElement("#conflictClose"), conflictReload: requiredElement("#conflictReload"), conflictCopy: requiredElement("#conflictCopy"), conflictCancel: requiredElement("#conflictCancel"),
    importCenterDialog: requiredElement("#importCenterDialog"), importCenterClose: requiredElement("#importCenterClose"), importCenterCancel: requiredElement("#importCenterCancel"), importSourceName: requiredElement("#importSourceName"), importSourceMeta: requiredElement("#importSourceMeta"), importCompatibilityNote: requiredElement("#importCompatibilityNote"), importSummary: requiredElement("#importSummary"), importFilters: requiredElement("#importFilters"), importBatchActions: requiredElement("#importBatchActions"), importBatchGroup: requiredElement("#importBatchGroup"), importBatchDecision: requiredElement("#importBatchDecision"), importBatchApply: requiredElement("#importBatchApply"), importVisibleCount: requiredElement("#importVisibleCount"), importItemList: requiredElement("#importItemList"), importReplaceRestore: requiredElement("#importReplaceRestore"), importApplyMerge: requiredElement("#importApplyMerge"),
    importProgressDialog: requiredElement("#importProgressDialog"), importProgressStages: requiredElement("#importProgressStages"), importProgressText: requiredElement("#importProgressText"), importProgressCancel: requiredElement("#importProgressCancel"), importResultDialog: requiredElement("#importResultDialog"), importResultClose: requiredElement("#importResultClose"), importResultText: requiredElement("#importResultText"), importDownloadReport: requiredElement("#importDownloadReport"), importLocateChanges: requiredElement("#importLocateChanges"), importRollback: requiredElement("#importRollback"), importResultDone: requiredElement("#importResultDone"), moveDialog: requiredElement("#moveDialog"),
    moveDialogForm: requiredElement("#moveDialogForm"), moveFolder: requiredElement("#moveFolder"), movePriority: requiredElement("#movePriority"),
    movePrevious: requiredElement("#movePrevious"), moveNext: requiredElement("#moveNext"), moveRestriction: requiredElement("#moveRestriction"),
    moveSubmit: requiredElement("#moveSubmit"), moveDelete: requiredElement("#moveDelete"), rescheduleDialog: requiredElement("#rescheduleDialog"),
    rescheduleForm: requiredElement("#rescheduleForm"), rescheduleDate: requiredElement("#rescheduleDate"), rescheduleReason: requiredElement("#rescheduleReason"),
    toast: requiredElement("#toast"), liveRegion: requiredElement("#liveRegion"),
  };
}
