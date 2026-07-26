/**
 * DecoratorMapper
 */

export interface DecoratorDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface DecoratorEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class DecoratorMapper {
  toDto(entity: DecoratorEntityData): DecoratorDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: DecoratorDto): DecoratorEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: DecoratorEntityData[]): DecoratorDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: DecoratorDto[]): DecoratorEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: DecoratorEntityData, patch: Partial<DecoratorEntityData>): DecoratorEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
