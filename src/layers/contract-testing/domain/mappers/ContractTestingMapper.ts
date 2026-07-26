/**
 * ContractTestingMapper
 */

export interface ContractTestingDto {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  attributes: Record<string, unknown>;
  tags: string[];
}

export interface ContractTestingEntityData {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  attributes: Record<string, unknown>;
  tags: string[];
}

export class ContractTestingMapper {
  toDto(entity: ContractTestingEntityData): ContractTestingDto {
    return {
      id: entity.id,
      status: entity.status,
      createdAt: new Date(entity.createdAt).toISOString(),
      updatedAt: new Date(entity.updatedAt).toISOString(),
      attributes: { ...entity.attributes },
      tags: [...entity.tags],
    };
  }

  toEntity(dto: ContractTestingDto): ContractTestingEntityData {
    return {
      id: dto.id,
      status: dto.status,
      createdAt: new Date(dto.createdAt).getTime(),
      updatedAt: new Date(dto.updatedAt).getTime(),
      attributes: { ...dto.attributes },
      tags: [...dto.tags],
    };
  }

  toDtoList(entities: ContractTestingEntityData[]): ContractTestingDto[] {
    return entities.map((e) => this.toDto(e));
  }

  toEntityList(dtos: ContractTestingDto[]): ContractTestingEntityData[] {
    return dtos.map((d) => this.toEntity(d));
  }

  merge(base: ContractTestingEntityData, patch: Partial<ContractTestingEntityData>): ContractTestingEntityData {
    return {
      ...base,
      ...patch,
      attributes: { ...base.attributes, ...(patch.attributes ?? {}) },
      tags: patch.tags ? [...patch.tags] : [...base.tags],
    };
  }
}
