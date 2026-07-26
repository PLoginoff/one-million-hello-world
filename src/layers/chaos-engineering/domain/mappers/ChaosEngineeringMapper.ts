/**
 * ChaosEngineeringMapper
 */

export interface ChaosEngineeringDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface ChaosEngineeringEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ChaosEngineeringMapper {
  toDto(entity: ChaosEngineeringEntityData): ChaosEngineeringDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: ChaosEngineeringDto): ChaosEngineeringEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: ChaosEngineeringEntityData[]): ChaosEngineeringDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: ChaosEngineeringDto[]): ChaosEngineeringEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: ChaosEngineeringEntityData, patch: Partial<ChaosEngineeringEntityData>): ChaosEngineeringEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
