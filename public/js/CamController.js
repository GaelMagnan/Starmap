//Something to handle moving the camera between POI's
/*global THREE*/
import { EOS_SIZE, ZOOM_INTO_DIST, CAM_MAX_ZOOM } from "./config.js";
export default class CamController {
	constructor(camera, domElm, app) {
		this.camera = camera;
		var geometry = new THREE.CylinderGeometry(10, 10, 10, 10);
		var material = new THREE.MeshBasicMaterial({
			color: 0xffff00,
			wireframe: true,
		});
		this.infrontOfCam = new THREE.Mesh(geometry, material);

		this.camera.add(this.infrontOfCam);
		this.infrontOfCam.position.set(0, 0, -10);

		this.orbitCtrl = new THREE.OrbitControls(camera, domElm);
		this.lerpTarget = new THREE.Vector3(0, 0, 0);
		this.posLerp = false;
		this.rotLerp = false;
		this.dist = 0;
		this.app = app;
		this.samePosTime = 0
		this.init();
	}
	//Initilizes the camera controller
	init() {
		this.orbitCtrl.mouseButtons.LEFT = 2;
		this.orbitCtrl.mouseButtons.RIGHT = 0;
		this.orbitCtrl.mouseButtons.MIDDLE = -1;
		//Prevent weird panning when pressing wasd
		this.orbitCtrl.keys.LEFT = 0;
		this.orbitCtrl.keys.RIGHT = 0;
		this.orbitCtrl.keys.UP = 0;
		this.orbitCtrl.keys.DOWN = 0;

		this.orbitCtrl.target.set(
			this.app.sceneObjs.Safe.position.x,
			this.app.sceneObjs.Safe.position.y,
			this.app.sceneObjs.Safe.position.z
		);
		this.orbitCtrl.enableDamping = true;
		this.orbitCtrl.maxDistance = CAM_MAX_ZOOM;
		this.lastPos = {x: 0, y: 0, z: 0}

		this.camera.position.set(EOS_SIZE * 5, 1000000, 1000000);
		this.posLerpTo(EOS_SIZE * 1.6, 100000, 100000)
	}
	//Called to move the camera to the target point
	update() {
		//handles dynamic FPS changing
		let distanceTo = this.camera.position.distanceTo(this.orbitCtrl.target);

		if (this.dist === distanceTo && this.lastPos.x === this.camera.position.x
			&& this.lastPos.y === this.camera.position.y && this.lastPos.z === this.camera.position.z) {
			this.samePosTime++
		} else {
			this.samePosTime = 0;
		}

		this.lastPos.x = this.camera.position.x
		this.lastPos.y = this.camera.position.y
		this.lastPos.z = this.camera.position.z

		this.dist = distanceTo;

		if (this.samePosTime > 50) {
			this.app.setFpsTarget(15)
		} else {
			this.app.setFpsTarget(60)
		}

		if (this.posLerp) {
			if (
				this.camera.position.distanceTo(this.lerpTarget) < ZOOM_INTO_DIST
			) {
				this.posLerp = false;
			} else {
				this.camera.position.lerp(this.lerpTarget, 0.05);
			}
		}
		if (this.rotLerp) {
			var rotationMatrix = new THREE.Matrix4();
			var targetQuaternion = new THREE.Quaternion();
			rotationMatrix.lookAt(
				this.camera.position,
				this.lerpTarget,
				this.camera.up
			);
			targetQuaternion.setFromRotationMatrix(rotationMatrix);
			this.camera.quaternion.rotateTowards(targetQuaternion, 0.05);
			this.camera.updateMatrixWorld();
			var vector = new THREE.Vector3();
			vector.setFromMatrixPosition(this.infrontOfCam.matrixWorld);
			this.orbitCtrl.target = vector;
			if (this.camera.quaternion.equals(targetQuaternion)) {
				this.orbitCtrl.target.set(
					this.lerpTarget.x,
					this.lerpTarget.y,
					this.lerpTarget.z
				);
				this.rotLerp = false;
			}
		}
		this.orbitCtrl.update();
		this.orbitCtrl.position0.set(0, 0, 0); //Dont ask me why this is here
	}
	//Instructs the camera to go to a new point in space
	lerpCamTo(x, y, z) {
		this.lerpTarget.set(x, y, z);
		this.posLerp = true;
		this.rotLerp = true;
	}

	posLerpTo(x, y, z) {
		this.lerpTarget = new THREE.Vector3(x, y, z)
		this.posLerp = true;
	}
}
