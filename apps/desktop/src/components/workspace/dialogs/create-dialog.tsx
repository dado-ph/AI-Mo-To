import * as React from "react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "../../ui/dialog.js";
import { Button } from "../../ui/button.js";
import { Input } from "../../ui/input.js";
import { FolderPlus, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "../../../lib/utils.js";

export interface CreateWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void> | void;
  className?: string | undefined;
}

const NAME_REGEX = /^[a-zA-Z0-9_\-\s]+$/;

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreate,
  className
}: CreateWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [open]);

  const validateName = (val: string): string | null => {
    const trimmed = val.trim();
    if (!trimmed) {
      return "Workspace name cannot be empty.";
    }
    if (trimmed.length > 80) {
      return "Workspace name cannot exceed 80 characters.";
    }
    if (!NAME_REGEX.test(trimmed)) {
      return "Only letters, numbers, spaces, hyphens, and underscores are allowed.";
    }
    return null;
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setName(val);
    if (error) {
      setError(validateName(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateName(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate(name.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="modal" className={cn("max-w-md p-6", className)}>
        <DialogHeader className="space-y-1 pb-3 border-b border-border/70">
          <div className="flex items-center gap-2">
            <FolderPlus className="size-5 text-primary" />
            <DialogTitle className="text-xl font-bold">New Workspace</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Create an independent, version-tracked workspace directory for your agent.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <label htmlFor="workspace-name-input" className="text-xs font-semibold text-foreground">
              Workspace Name
            </label>
            <Input
              id="workspace-name-input"
              value={name}
              onChange={handleNameChange}
              placeholder="e.g. Garden Planner, Task Master"
              autoFocus
              disabled={isSubmitting}
              className={cn(error && "border-destructive focus-visible:ring-destructive")}
            />
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive pt-1">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/70">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting || !name.trim()}
              className="gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Workspace</span>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
