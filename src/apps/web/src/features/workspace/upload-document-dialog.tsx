"use client";

import { useState, type ChangeEvent, type ReactElement } from "react";

import { knowledgeCopy } from "../../copy/knowledge";
import { ApiClientError } from "../api/client";
import { useUploadDocumentFile } from "@/features/hooks/knowledge/knowledge-hooks";
import { Button } from "@/components/ui/button";
import { DialogFrame } from "@/components/ui/dialog";
import type { FormSubmitHandler } from "@/lib/form-types";
import { Notice } from "@/components/ui/alert";
import {
  documentUploadAcceptedFileTypes,
  formatDocumentUploadSuccessNotice,
  toDocumentUploadApiErrorMessage,
  validateDocumentUploadInput,
} from "./workspace-upload-helpers";
import { WorkspaceTextField } from "./workspace-text-field";

export function UploadDocumentDialog({
  knowledgeBaseId,
  onClose,
  onNotice,
}: {
  knowledgeBaseId: string;
  onClose: () => void;
  onNotice: (notice: string) => void;
}): ReactElement {
  const uploadDocumentFile = useUploadDocumentFile();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    setFiles(Array.from(event.currentTarget.files ?? []));
    setError(null);
  }

  const handleSubmit: FormSubmitHandler = async (event) => {
    event.preventDefault();
    setError(null);

    const validation = validateDocumentUploadInput({ files, title });
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    try {
      const result = await uploadDocumentFile.mutateAsync({
        file: validation.file,
        knowledgeBaseId,
        title: validation.title,
      });
      onNotice(formatDocumentUploadSuccessNotice(result));
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? toDocumentUploadApiErrorMessage(caught.response.code)
          : knowledgeCopy.uploadErrors.generic,
      );
    }
  };

  return (
    <DialogFrame
      description={knowledgeCopy.uploadFileDescription}
      onClose={onClose}
      onSubmit={handleSubmit}
      title={knowledgeCopy.uploadFile}
    >
      <div className="space-y-4">
        {error === null ? null : <Notice tone="error">{error}</Notice>}
        <div>
          <label
            className="block text-sm font-medium text-foreground"
            htmlFor="document-upload-file"
          >
            {knowledgeCopy.uploadFileLabel}
          </label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {knowledgeCopy.uploadFileHelp}
          </p>
          <input
            accept={documentUploadAcceptedFileTypes}
            className="mt-2 block min-h-11 w-full rounded-3xl border border-border px-3 py-2 text-sm file:mr-3 file:rounded-3xl file:border-0 file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
            disabled={uploadDocumentFile.isPending}
            id="document-upload-file"
            onChange={handleFileChange}
            type="file"
          />
        </div>
        <WorkspaceTextField
          disabled={uploadDocumentFile.isPending}
          id="document-upload-title"
          label={knowledgeCopy.uploadTitleLabel}
          onChange={setTitle}
          placeholder={knowledgeCopy.uploadTitlePlaceholder}
          value={title}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={uploadDocumentFile.isPending} onClick={onClose}>
            {knowledgeCopy.cancel}
          </Button>
          <Button
            disabled={uploadDocumentFile.isPending}
            disabledReason={knowledgeCopy.pending.uploadingFile}
            type="submit"
            variant="primary"
          >
            {knowledgeCopy.uploadFile}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
