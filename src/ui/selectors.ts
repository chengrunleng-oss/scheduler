import { requiredElement } from "./dom.js";

export interface Elements {
  sidebar: HTMLElement;
  sidebarClose: HTMLButtonElement;
  navToggle: HTMLButtonElement;
  globalNewTask: HTMLButtonElement;
  defaultDueDate: HTMLSelectElement;
  defaultPriority: HTMLSelectElement;
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
  importFile: HTMLInputElement;
  resetDemo: HTMLButtonElement;
  undoAction: HTMLButtonElement;
  redoAction: HTMLButtonElement;
  themeSelect: HTMLSelectElement;
  taskDetail: HTMLElement;
  detailClose: HTMLButtonElement;
  detailEmpty: HTMLElement;
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
  folderDialog: HTMLDialogElement;
  folderDialogForm: HTMLFormElement;
  folderDialogTitle: HTMLElement;
  folderName: HTMLInputElement;
  folderParent: HTMLSelectElement;
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
    sidebar: requiredElement("#sidebar"), sidebarClose: requiredElement("#sidebarClose"), navToggle: requiredElement("#navToggle"),
    globalNewTask: requiredElement("#globalNewTask"), defaultDueDate: requiredElement("#defaultDueDate"), defaultPriority: requiredElement("#defaultPriority"),
    newFolder: requiredElement("#newFolder"), folderTree: requiredElement("#folderTree"), workspaceTitle: requiredElement("#workspaceTitle"),
    taskList: requiredElement("#taskList"), emptyState: requiredElement("#emptyState"), dragHint: requiredElement("#dragHint"), searchInput: requiredElement("#searchInput"),
    statusFilters: document.querySelectorAll(".status-segment"), viewModes: document.querySelectorAll(".view-segment"),
    metricActive: requiredElement("#metricActive"), metricCompleted: requiredElement("#metricCompleted"), metricDiscarded: requiredElement("#metricDiscarded"), metricDue: requiredElement("#metricDue"),
    exportData: requiredElement("#exportData"), importData: requiredElement("#importData"), importFile: requiredElement("#importFile"), resetDemo: requiredElement("#resetDemo"),
    undoAction: requiredElement("#undoAction"), redoAction: requiredElement("#redoAction"), themeSelect: requiredElement("#themeSelect"),
    taskDetail: requiredElement("#taskDetail"), detailClose: requiredElement("#detailClose"), detailEmpty: requiredElement("#detailEmpty"), detailForm: requiredElement("#detailForm"),
    detailStatusBadge: requiredElement("#detailStatusBadge"), detailTitle: requiredElement("#detailTitle"), detailNotes: requiredElement("#detailNotes"),
    detailPriority: requiredElement("#detailPriority"), detailFolder: requiredElement("#detailFolder"), detailDueDate: requiredElement("#detailDueDate"),
    detailTag: requiredElement("#detailTag"), detailRescheduleReason: requiredElement("#detailRescheduleReason"), detailCreatedAt: requiredElement("#detailCreatedAt"),
    detailUpdatedAt: requiredElement("#detailUpdatedAt"), timelineSection: requiredElement("#timelineSection"), rescheduleTimeline: requiredElement("#rescheduleTimeline"), cancelDetail: requiredElement("#cancelDetail"),
    folderDialog: requiredElement("#folderDialog"), folderDialogForm: requiredElement("#folderDialogForm"), folderDialogTitle: requiredElement("#folderDialogTitle"),
    folderName: requiredElement("#folderName"), folderParent: requiredElement("#folderParent"), folderDeleteDialog: requiredElement("#folderDeleteDialog"),
    folderDeleteText: requiredElement("#folderDeleteText"), folderDeleteMove: requiredElement("#folderDeleteMove"), folderDeleteBranch: requiredElement("#folderDeleteBranch"),
    folderDeleteCancel: requiredElement("#folderDeleteCancel"), folderDeleteClose: requiredElement("#folderDeleteClose"), confirmDialog: requiredElement("#confirmDialog"),
    confirmTitle: requiredElement("#confirmTitle"), confirmText: requiredElement("#confirmText"), confirmClose: requiredElement("#confirmClose"),
    confirmCancel: requiredElement("#confirmCancel"), confirmOk: requiredElement("#confirmOk"), moveDialog: requiredElement("#moveDialog"),
    moveDialogForm: requiredElement("#moveDialogForm"), moveFolder: requiredElement("#moveFolder"), movePriority: requiredElement("#movePriority"),
    movePrevious: requiredElement("#movePrevious"), moveNext: requiredElement("#moveNext"), moveRestriction: requiredElement("#moveRestriction"),
    moveSubmit: requiredElement("#moveSubmit"), moveDelete: requiredElement("#moveDelete"), rescheduleDialog: requiredElement("#rescheduleDialog"),
    rescheduleForm: requiredElement("#rescheduleForm"), rescheduleDate: requiredElement("#rescheduleDate"), rescheduleReason: requiredElement("#rescheduleReason"),
    toast: requiredElement("#toast"), liveRegion: requiredElement("#liveRegion"),
  };
}
