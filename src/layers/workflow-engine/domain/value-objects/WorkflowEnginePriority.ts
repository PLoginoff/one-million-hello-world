/**
 * WorkflowEnginePriority Value Object
 *
 * Priority level for workflow-engine tasks.
 */

export class WorkflowEnginePriority {
  readonly value: number;
  readonly label: string;

  private constructor(value: number, label: string) {
    this.value = value;
    this.label = label;
  }

  static create(value: number): WorkflowEnginePriority {
    if (value < 0 || value > 10) {
      throw new Error('Priority must be between 0 and 10');
    }
    const label = value <= 2 ? 'low' : value <= 5 ? 'medium' : value <= 8 ? 'high' : 'critical';
    return new WorkflowEnginePriority(value, label);
  }

  static low(): WorkflowEnginePriority {
    return new WorkflowEnginePriority(1, 'low');
  }
  static medium(): WorkflowEnginePriority {
    return new WorkflowEnginePriority(5, 'medium');
  }
  static high(): WorkflowEnginePriority {
    return new WorkflowEnginePriority(8, 'high');
  }
  static critical(): WorkflowEnginePriority {
    return new WorkflowEnginePriority(10, 'critical');
  }

  isLow(): boolean {
    return this.value <= 2;
  }
  isMedium(): boolean {
    return this.value > 2 && this.value <= 5;
  }
  isHigh(): boolean {
    return this.value > 5 && this.value <= 8;
  }
  isCritical(): boolean {
    return this.value > 8;
  }

  isHigherThan(other: WorkflowEnginePriority): boolean {
    return this.value > other.value;
  }
  isLowerThan(other: WorkflowEnginePriority): boolean {
    return this.value < other.value;
  }

  equals(other: WorkflowEnginePriority): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.label + ' (' + this.value + ')';
  }
}
