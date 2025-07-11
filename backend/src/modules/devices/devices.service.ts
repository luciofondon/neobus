import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bus, BusStatus } from '../../entities/bus.entity';
import { Pupitre, PupitreStatus } from '../../entities/pupitre.entity';
import { Validator, ValidatorStatus } from '../../entities/validator.entity';
import { Camera, CameraStatus } from '../../entities/camera.entity';
import { ModemStatus, GPSStatus, ReaderStatus, PrinterStatus } from '../../entities/pupitre.entity';

interface BusWithStatus extends Bus {
  status: BusStatus;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Bus)
    private busRepository: Repository<Bus>,
    @InjectRepository(Pupitre)
    private pupitreRepository: Repository<Pupitre>,
    @InjectRepository(Validator)
    private validatorRepository: Repository<Validator>,
    @InjectRepository(Camera)
    private cameraRepository: Repository<Camera>,
  ) {}

  // Métodos para Buses
  async findAllBuses(status?: BusStatus): Promise<BusWithStatus[]> {
    this.logger.debug(`findAllBuses called with status: ${status}`);
    
    // Primero obtenemos los buses con sus relaciones
    const buses = await this.busRepository
      .createQueryBuilder('bus')
      .leftJoinAndSelect('bus.pupitres', 'pupitres')
      .leftJoinAndSelect('bus.validators', 'validators')
      .leftJoinAndSelect('bus.cameras', 'cameras')
      .getMany();

    this.logger.debug(`Buses encontrados: ${buses.length}`, {
      buses: buses.map(bus => ({
        id: bus.id,
        pupitres: bus.pupitres?.map(p => ({
          id: p.id,
          busId: p.busId,
          qrStatus: p.qrStatus,
          rfidStatus: p.rfidStatus,
          emvStatus: p.emvStatus,
          printerStatus: p.printerStatus,
          modemStatus: p.modemStatus,
          gpsStatus: p.gpsStatus
        })),
        validators: bus.validators?.map(v => ({
          id: v.id,
          busId: v.busId,
          rfidStatus: v.rfidStatus,
          emvStatus: v.emvStatus
        })),
        cameras: bus.cameras?.map(c => ({
          id: c.id,
          busId: c.busId,
          status: c.status
        }))
      }))
    });
    
    // Añadir el estado calculado a cada bus
    const busesWithStatus = buses.map(bus => {
      const calculatedStatus = this.calculateBusStatus(bus);
      this.logger.debug(`Estado calculado para bus ${bus.id}: ${calculatedStatus}`, {
        busId: bus.id,
        pupitresCount: bus.pupitres?.length || 0,
        validatorsCount: bus.validators?.length || 0,
        camerasCount: bus.cameras?.length || 0
      });
      return {
        ...bus,
        status: calculatedStatus
      };
    });

    if (status) {
      const filteredBuses = busesWithStatus.filter(bus => bus.status === status);
      this.logger.debug(`Found ${filteredBuses.length} buses with status ${status}`);
      return filteredBuses;
    }
    this.logger.debug(`Found ${buses.length} buses without status filter`);
    return busesWithStatus;
  }

  async findBusById(id: string): Promise<BusWithStatus | null> {
    const bus = await this.busRepository
      .createQueryBuilder('bus')
      .leftJoinAndSelect('bus.pupitres', 'pupitres')
      .leftJoinAndSelect('bus.validators', 'validators')
      .leftJoinAndSelect('bus.cameras', 'cameras')
      .where('bus.id = :id', { id })
      .getOne();
    
    if (bus) {
      this.logger.debug(`Bus ${id} encontrado con:`, {
        pupitresCount: bus.pupitres?.length || 0,
        validatorsCount: bus.validators?.length || 0,
        camerasCount: bus.cameras?.length || 0
      });

      const calculatedStatus = this.calculateBusStatus(bus);
      return {
        ...bus,
        status: calculatedStatus
      };
    }
    return null;
  }

  // Métodos para Pupitres
  async findAllPupitres(status?: PupitreStatus): Promise<Pupitre[]> {
    this.logger.debug(`findAllPupitres called with status: ${status}`);
    const pupitres = await this.pupitreRepository.find();
    
    // Añadir el estado calculado a cada pupitre
    const pupitresWithStatus = pupitres.map(pupitre => ({
      ...pupitre,
      status: this.calculatePupitreStatus(pupitre)
    }));

    if (status) {
      const filteredPupitres = pupitresWithStatus.filter(pupitre => pupitre.status === status);
      this.logger.debug(`Found ${filteredPupitres.length} pupitres with status ${status}`);
      return filteredPupitres;
    }
    this.logger.debug(`Found ${pupitres.length} pupitres without status filter`);
    return pupitresWithStatus;
  }

  async findPupitreById(id: string): Promise<Pupitre | null> {
    const pupitre = await this.pupitreRepository.findOne({ where: { id } });
    if (pupitre) {
      return {
        ...pupitre,
        status: this.calculatePupitreStatus(pupitre)
      };
    }
    return null;
  }

  async updatePupitreStatus(id: string, status: PupitreStatus): Promise<Pupitre> {
    const pupitre = await this.findPupitreById(id);
    if (!pupitre) {
      throw new Error(`Pupitre with ID ${id} not found`);
    }
    // El estado se calcula dinámicamente, no se actualiza directamente
    return pupitre;
  }

  // Método para calcular el estado del pupitre en caliente
  private calculatePupitreStatus(pupitre: Pupitre): PupitreStatus {
    const {
      modemStatus,
      gpsStatus,
      emvStatus,
      rfidStatus,
      printerStatus,
      qrStatus
    } = pupitre;

    // Si todos los componentes están en KO
    if (
      modemStatus === ModemStatus.KO &&
      gpsStatus === GPSStatus.KO &&
      emvStatus === ReaderStatus.KO &&
      rfidStatus === ReaderStatus.KO &&
      printerStatus === PrinterStatus.KO &&
      qrStatus === ReaderStatus.KO
    ) {
      return PupitreStatus.KO;
    }

    // Si MODEM, GPS, RFID, EMV o IMPRESORA está en KO
    if (
      modemStatus === ModemStatus.KO ||
      gpsStatus === GPSStatus.KO ||
      emvStatus === ReaderStatus.KO ||
      rfidStatus === ReaderStatus.KO ||
      printerStatus === PrinterStatus.KO
    ) {
      return PupitreStatus.KO;
    }

    // Si algún otro componente está en KO (por ejemplo QR)
    if (
      qrStatus === ReaderStatus.KO
    ) {
      return PupitreStatus.WARNING;
    }

    // Si todos los componentes están en OK
    return PupitreStatus.OK;
  }

  // Métodos para Validadores
  async findAllValidators(status?: ValidatorStatus): Promise<Validator[]> {
    this.logger.debug(`findAllValidators called with status: ${status}`);
    const validators = await this.validatorRepository.find();
    
    // Añadir el estado calculado a cada validador
    const validatorsWithStatus = validators.map(validator => ({
      ...validator,
      status: this.calculateValidatorStatus(validator)
    }));

    if (status) {
      const filteredValidators = validatorsWithStatus.filter(validator => validator.status === status);
      this.logger.debug(`Found ${filteredValidators.length} validators with status ${status}`);
      return filteredValidators;
    }
    this.logger.debug(`Found ${validators.length} validators without status filter`);
    return validatorsWithStatus;
  }

  async findValidatorById(id: string): Promise<Validator | null> {
    const validator = await this.validatorRepository.findOne({ where: { id } });
    if (validator) {
      return {
        ...validator,
        status: this.calculateValidatorStatus(validator)
      };
    }
    return null;
  }

  async updateValidatorStatus(id: string, status: ValidatorStatus): Promise<Validator> {
    const validator = await this.findValidatorById(id);
    if (!validator) {
      throw new Error(`Validator with ID ${id} not found`);
    }
    // El estado se calcula dinámicamente, no se actualiza directamente
    return validator;
  }

  // Método para calcular el estado del validador en caliente
  private calculateValidatorStatus(validator: Validator): ValidatorStatus {
    // Si ambos componentes están en KO, el validador está en KO
    if (
      validator.rfidStatus === ReaderStatus.KO &&
      validator.emvStatus === ReaderStatus.KO
    ) {
      return ValidatorStatus.KO;
    }

    // Si ambos componentes están en OK, el validador está en OK
    if (
      validator.rfidStatus === ReaderStatus.OK &&
      validator.emvStatus === ReaderStatus.OK
    ) {
      return ValidatorStatus.OK;
    }

    // En cualquier otro caso, el validador está en WARNING
    return ValidatorStatus.WARNING;
  }

  // Métodos para Cámaras
  async findAllCameras(status?: CameraStatus): Promise<Camera[]> {
    this.logger.debug(`findAllCameras called with status: ${status}`);
    if (status) {
      const cameras = await this.cameraRepository.createQueryBuilder('camera')
        .where('camera.status = :status', { status })
        .getMany();
      this.logger.debug(`Found ${cameras.length} cameras with status ${status}`);
      return cameras;
    }
    const allCameras = await this.cameraRepository.find();
    this.logger.debug(`Found ${allCameras.length} cameras without status filter`);
    return allCameras;
  }

  async findCameraById(id: string): Promise<Camera | null> {
    return this.cameraRepository.findOne({ where: { id } });
  }

  async updateCameraStatus(id: string, status: CameraStatus): Promise<Camera> {
    const camera = await this.findCameraById(id);
    if (!camera) {
      throw new Error(`Camera with ID ${id} not found`);
    }
    camera.status = status;
    return this.cameraRepository.save(camera);
  }

  private async recalculateBusStatus(busId: string): Promise<void> {
    // Obtener todos los pupitres y validadores del bus
    const pupitres = await this.pupitreRepository.find({ where: { busId } });
    const validators = await this.validatorRepository.find({ where: { busId } });

    // El estado del bus se calcula dinámicamente, no se almacena en la BD
    // Por lo tanto, no es necesario actualizar el estado del bus aquí
  }

  // Método para calcular el estado del bus en caliente
  private calculateBusStatus(bus: Bus): BusStatus {
    const pupitres = bus.pupitres || [];
    const validators = bus.validators || [];
    const cameras = bus.cameras || [];

    this.logger.debug(`Calculando estado para bus ${bus.id}:`, {
      pupitres: pupitres.map(p => ({ id: p.id, qrStatus: p.qrStatus, rfidStatus: p.rfidStatus, emvStatus: p.emvStatus, printerStatus: p.printerStatus, modemStatus: p.modemStatus, gpsStatus: p.gpsStatus })),
      validators: validators.map(v => ({ id: v.id, rfidStatus: v.rfidStatus, emvStatus: v.emvStatus })),
      cameras: cameras.map(c => ({ id: c.id, status: c.status }))
    });

    // Primero calculamos el estado de cada pupitre
    const pupitresWithStatus = pupitres.map(pupitre => {
      const status = this.calculatePupitreStatus(pupitre);
      this.logger.debug(`Pupitre ${pupitre.id} calculado como ${status}`, {
        pupitreId: pupitre.id,
        qrStatus: pupitre.qrStatus,
        rfidStatus: pupitre.rfidStatus,
        emvStatus: pupitre.emvStatus,
        printerStatus: pupitre.printerStatus,
        modemStatus: pupitre.modemStatus,
        gpsStatus: pupitre.gpsStatus,
        calculatedStatus: status
      });
      return {
        ...pupitre,
        status
      };
    });

    // Calculamos el estado de cada validador
    const validatorsWithStatus = validators.map(validator => {
      const status = this.calculateValidatorStatus(validator);
      this.logger.debug(`Validador ${validator.id} calculado como ${status}`, {
        validatorId: validator.id,
        rfidStatus: validator.rfidStatus,
        emvStatus: validator.emvStatus,
        calculatedStatus: status
      });
      return {
        ...validator,
        status
      };
    });

    // Si algún dispositivo está en KO, el bus está en KO
    if (pupitresWithStatus.some(p => p.status === PupitreStatus.KO) || 
        validatorsWithStatus.some(v => v.status === ValidatorStatus.KO) ||
        cameras.some(c => c.status === CameraStatus.KO)) {
      this.logger.debug(`Bus ${bus.id} está en KO debido a dispositivos en KO`);
      return BusStatus.KO;
    }

    // Si algún dispositivo está en WARNING, el bus está en WARNING
    if (pupitresWithStatus.some(p => p.status === PupitreStatus.WARNING) || 
        validatorsWithStatus.some(v => v.status === ValidatorStatus.WARNING)) {
      this.logger.debug(`Bus ${bus.id} está en WARNING debido a dispositivos en WARNING`);
      return BusStatus.WARNING;
    }

    // El bus está en OK solo si TODOS los dispositivos están en OK
    if (pupitresWithStatus.every(p => p.status === PupitreStatus.OK) && 
        validatorsWithStatus.every(v => v.status === ValidatorStatus.OK) &&
        cameras.every(c => c.status === CameraStatus.OK)) {
      this.logger.debug(`Bus ${bus.id} está en OK - todos los dispositivos OK`);
      return BusStatus.OK;
    }

    // Si no se cumple ninguna de las condiciones anteriores, el bus está en WARNING
    this.logger.debug(`Bus ${bus.id} está en WARNING por defecto`);
    return BusStatus.WARNING;
  }
} 