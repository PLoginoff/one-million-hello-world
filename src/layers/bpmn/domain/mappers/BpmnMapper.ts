/**
 * BpmnMapper
 */

export interface BpmnDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface BpmnEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class BpmnMapper {
  toDto(entity: BpmnEntityData): BpmnDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: BpmnDto): BpmnEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: BpmnEntityData[]): BpmnDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: BpmnDto[]): BpmnEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: BpmnEntityData, patch: Partial<BpmnEntityData>): BpmnEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
