/*global THREE*/
/*global $*/

const infoTemplate = `
<div class="info" id="infoWindow">
	<div class="more-info">
		<span class="material-icons" onmouseover="hoverHandler()">help</span>
		<span class="more-info-tooltip">
			<strong>Created:</strong> %CREATED_AT%
			<br>
			<strong>Edited:</strong> %EDITED_AT%
		</span>
	</div>

	<div class="info-grid">

		<div class="info-title-grid">
			<h1 class="infoText no-drag" style="display: inline;">%POINT_NAME%</h1> %BRINJECT% <span class="infoText" style="display: inline;">(%TYPE%)</span>
		</div>

		<div class="info-coord-grid">
			<div class="isanDispalyDiv">
				<p class="infoText no-drag isanDispalyVal">X: %POS_X%</p>
				<p class="infoText no-drag isanDispalyVal">Y: %POS_Y%</p>
				<p class="infoText no-drag isanDispalyVal">Z: %POS_Z%</p>
			</div>
		</div>

		<div class="info-option-grid">
			<div class="infoDiv">
				<button id="linksharable">Copy link </button>
				<br>
				<button id="epivals">Copy cords</button>
				<br>
				<button id="focus">Focus</button>
			</div>
		</div>
		<div class="info-icon-grid">
			<div class="infoDiv">
				<img src=%TYPE_IMAGE% width="64" height="64">
			</div>
		</div>
		<div class="info-creator-grid">
			<p class="infoText-02" style="display: inline;"><strong>Creator:</strong> <b>%CREATOR%</b></p>
		</div>
		<div class="info-layer-grid">
			<p class="infoText-02" style="display: inline;"><strong>Layer:</strong> <b>%LAYER%</b></p>
		</div>
		<div class="info-desc-grid">
			<div class="desc">
				<p class="infoText no-drag">%DESCRIPTION%</p>
			</div>
		</div>
		<div class="info-pic-grid">
			<a href="%IMAGE_URL%" target="_blank">
			<img src="%IMAGE_URL%" style="display:%IMAGE_DISPLAY%" class="infoImage">
			</a>
		</div>
	</div>

	


	
	
	

</div>
`;

const deletePointTemplate = `
	<button type="button" name="button" id="delete-point">Delete</button>
`;

const updatePointTemplate = `
	<button type="button" name="button" id="update-point">Update</button>
`;

const optionTemplate = `
<option value="%VALUE%">
	%NAME%
</option>
`;

const viewFilterTemplate = `
<div class="filter-view-option checkbox-option checkbox">
	<input id=%ID% type="checkbox" name="%NAME%" value="%NAME%" checked>
	<label for="%NAME%">
		%NAME%
	</label>
	<span class="filter-view-option-tooltip">%INFO%</span>
</div>
<br>
`;

import {
	EOS_SIZE,
	DIST_TO_BELT,
	BELT_THICK,
	SAFE_LEN,
	SAFE_RAD,
	ENABLE_SBOX,
	MARKER_SIZE_MIN,
	MARKER_SIZE_MAX,
	DIST_MIN,
	DIST_MAX,
	ISAN_RANGE,
	safePos,
	pointOffset,
	TYPES,
	AUTH_REDIR,
	URLS,
	ENV,
	BELT_HEIGHT,
	BELT_EDGE_RADIUS,
	BELT_QUALITY,
	EOS_QUALITY,
	FPS_DROP_TIME,
	LOW_FPS_VAL,
	HIGH_FPS_VAL,
	HEATMAN_TOTAL_IMAGES
} from "./config.js";

import {
	constrain,
	map,
	copyToClipboard,
	formatNumber
} from "./functions.js";

import PointManager, {
	fromGamePos
} from "./PointManager.js";
import API from "./API.js";
import CamController from "./CamController.js";
import SettingsManager from "./SettingsManager.js";
import Calculator from "./calculator.js";

import Stats from "./packages/Stats.js";

let mouseX = 0;
let mouseY = 0;

const ERROR = 0;
const SUCCESS = 1;

String.prototype.reverse = function () {
	return this.split("").reverse().join("");
};

function parseTypeName(name) {
	return name.split(" ").join("-");
}

//Honestly I feel this should be broken into two classes, the main App and some form of "UI manager" class, perhaps a project for another day
//Main map application
class App {
	constructor() {
		this.raycaster = new THREE.Raycaster();
		this.sceneObjs = {
			camera: null,
			scene: null,
			renderer: null,
			axis: null,
			Eos: null,
			Belt: null,
			Safe: null,
			EosClouds: null,
			IsanSphere: null,
		};
		this.cameraController;
		this.storage = localStorage;
		//Check if we want to focus on a point
		const focus = window.location.pathname.substring(1);
		if (focus) {
			this.storage.setItem("pointFocus", focus);
		}
		this.pointManager = new PointManager(this);
		this.settings = new SettingsManager(this);
		this.calculator = new Calculator(this);
		this.isLoggedIn = false;
		this.updatePointId;
		this.textFont;
		this.user;
		this.viewFilters = {
			types: {},
			groups: {},
		};
		this.isShiftHeld = false;
		this.lastLoginState = false;
		this.api = new API(this.pointManager, this);
		this.stats = new Stats();
		this.stats.showPanel(0);
		this.vertCamMove = 1;
		this.stats.dom.style.left = "85%";
		this.frameInterval = 1000 / 60;
		this.prevFrameTarget = 0;
		this.lastMouseMoved = Date.now();
		this.heatmap = [];
		this.heatmapAnim = {
			active: false,
			idx: 0,
			speed: 1,
		}
	}
	enableStats() {
		document.body.appendChild(this.stats.dom);
	}
	setLoadingMessage(message) {
		document.getElementById("loading-text").innerText = message;
	}

	hideLoadingMessage() {
		const el = document.getElementById("loading-screen");
		el.style.opacity = 0;

		el.addEventListener("transitionend", () => {
			el.remove()
		})
	}

	async init() {
		this.initScene();
		this.UISetup();

		this.setLoadingMessage("Loading assets...")
		//See if we just completed OAuth2
		if (window.location.search.includes("code")) {
			try {
				const code = window.location.search.substring("?code=".length);
				const jwt = await this.api.getJWTFromCode(code);
				if (jwt) {
					this.storage.setItem("jwt", jwt);
				}
			} catch (e) {}
		}
		//Lets ensure the jwt is still valid (if we have one)
		const jwt = this.storage.getItem("jwt");
		let needPubToken = true;
		if (jwt) {
			const hasValidToken = await this.api.confirmJWT(jwt);
			if (hasValidToken) needPubToken = false;
		}
		if (needPubToken) {
			await this.api.getPubJWT();
		}
	}
	//Updates what points should be displayed
	initFilters() {
		const filtersJSON = this.storage.getItem("viewFilters");
		if (!filtersJSON) return;
		const filters = JSON.parse(filtersJSON);
		for (var t in TYPES) {
			const type = TYPES[t];
			document.getElementById(`type-filter-${parseTypeName(type.name)}`).checked =
				filters.types[parseTypeName(type.name)];
		}
		this.user.g.forEach((group) => {
			document.getElementById(`group-filter-${group.id}`).checked =
				filters.groups[group.id];
		});
		this.viewFilters = filters;
		this.pointManager.updateDisplayed(this.viewFilters);
		this.updateFilters();
	}
	updateFilters() {
		for (var t in TYPES) {
			const type = TYPES[t];
			this.viewFilters.types[parseTypeName(type.name)] = document.getElementById(
				`type-filter-${parseTypeName(type.name)}`
			).checked;
		}
		this.user.g.forEach((group) => {
			this.viewFilters.groups[group.id] = document.getElementById(
				`group-filter-${group.id}`
			).checked;
		});
		this.storage.setItem("viewFilters", JSON.stringify(this.viewFilters));

		this.pointManager.updateDisplayed(this.viewFilters);
	}

	settingGet(setting, _default) {
		let result = undefined;
		try {
			result = JSON.parse(window.localStorage.getItem("settings"))[setting]
		} catch {
			console.log("Using default " + setting)
			result = _default
		}

		if (setting === undefined || setting === null) {
			console.log("Using default " + setting)
			result = _default
		}

		return result
	}
	//Sets up the threejs scene
	initScene() {
		this.sceneObjs.scene = new THREE.Scene();
		this.sceneObjs.camera = new THREE.PerspectiveCamera(
			75,
			window.innerWidth / window.innerHeight,
			0.1,
			100000000
		);

		const divElm = document.getElementById("main");
		this.sceneObjs.renderer = new THREE.WebGLRenderer({
			logarithmicDepthBuffer: true,
			antialias: true,
			powerPreference: "high-performance"
		});
		this.sceneObjs.renderer.setSize(window.innerWidth, window.innerHeight);
		divElm.appendChild(this.sceneObjs.renderer.domElement);

		//Eos
		const tex = new THREE.TextureLoader().load("../assets/planetTex.png");
		const eosGem = new THREE.SphereGeometry(EOS_SIZE, EOS_QUALITY, EOS_QUALITY);
		const eosMat = new THREE.MeshStandardMaterial({
			// color: 0x2c3ca3,
			metalness: 0.8,
			map: tex,
			roughness: 1,
			// wireframe: false,
		});
		this.sceneObjs.Eos = new THREE.Mesh(eosGem, eosMat);
		this.sceneObjs.Eos.castShadow = true;
		this.sceneObjs.scene.add(this.sceneObjs.Eos);

		//Safe zone
		var safeGem = new THREE.CylinderGeometry(
			SAFE_RAD,
			SAFE_RAD,
			SAFE_LEN,
			8,
			4
		);
		var safeMat = new THREE.MeshBasicMaterial({
			color: 0x009dd6, //0x009900,
			wireframe: true,
		});
		const Safe = new THREE.Mesh(safeGem, safeMat);
		Safe.position.set(safePos.x, safePos.y, safePos.z);
		Safe.rotation.set(Math.PI / 2, 0, Math.PI / 2);
		this.sceneObjs.Safe = Safe;
		Safe.visible = false;
		this.sceneObjs.scene.add(Safe);

		//Creating some basic lighting
		//This lighting dose not get saved, which may be a problem
		var ambient = new THREE.AmbientLight(0xf0f0f0); // soft white light
		this.sceneObjs.scene.add(ambient);
		var light = new THREE.PointLight(0xffffff, 2);
		light.position.set(EOS_SIZE * 4, EOS_SIZE * 4, EOS_SIZE);
		this.sceneObjs.scene.add(light);

		if (ENABLE_SBOX) {
			const skybox = new THREE.CubeTextureLoader()
				.setPath("../assets/skybox/")
				.load([
					"left.jpg",
					"right.jpg",
					"top.jpg",
					"bot.jpg",
					"front.jpg",
					"back.jpg",
				]);
			/*
			const loader = new THREE.CubeTextureLoader();

			const skybox = loader.load([
				"https://i.ibb.co/RBTc269/left.png",
				"https://i.ibb.co/Qky4htz/right.png",
				"https://i.ibb.co/bLczY5m/top.png",
				"https://i.ibb.co/zrq0KLR/bot.png",
				"https://i.ibb.co/TtpZB45/front.png",
				"https://i.ibb.co/56d6cPp/back.png",
			]);
			*/
			this.sceneObjs.scene.background = skybox;
		}

		//Add the clouds around Eos
		const cloudText = new THREE.TextureLoader(
			new THREE.LoadingManager(() => {})
			// ).load("../assets/cloud3.png");
		).load("../assets/cloud3.png");
		const MESH_SIZE = 76;
		const cloudGeom = new THREE.SphereGeometry(MESH_SIZE, EOS_QUALITY * 2, EOS_QUALITY * 2);
		const cloudMat = new THREE.MeshStandardMaterial({
			color: 0xcdddfd,
			transparent: true,
			opacity: 0.3,
			alphaMap: cloudText,
		});
		cloudMat.depthWrite = false;
		this.sceneObjs.EosClouds = new THREE.Mesh(cloudGeom, cloudMat);
		this.sceneObjs.EosClouds.scale.set(
			EOS_SIZE / (MESH_SIZE - 0.1),
			EOS_SIZE / (MESH_SIZE - 0.1),
			EOS_SIZE / (MESH_SIZE - 0.1)
		);
		this.sceneObjs.scene.add(this.sceneObjs.EosClouds);

		const isanGeom = new THREE.SphereGeometry(ISAN_RANGE, 32, 32);
		const isanMat = new THREE.MeshStandardMaterial({
			color: 0x00ff00,
			transparent: true,
			opacity: 0.3,
			// side: THREE.DoubleSide,
		});
		this.sceneObjs.IsanSphere = new THREE.Mesh(isanGeom, isanMat);
		this.sceneObjs.IsanSphere.position.set(
			pointOffset.x,
			pointOffset.y,
			pointOffset.z
		);
		this.sceneObjs.scene.add(this.sceneObjs.IsanSphere);

		//Create the cam controller
		this.cameraController = new CamController(
			this.sceneObjs.camera,
			this.sceneObjs.renderer.domElement,
			this
		);

		const originCords = fromGamePos({
			x: 0,
			y: 0,
			z: 0
		});
		const holder = new THREE.Object3D();
		holder.position.set(originCords.x, originCords.y, originCords.z);
		const arrowHelperX = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 500000, "#ff0000", 50000, 10000);
		const arrowHelperY = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), 500000, "#00ff00", 50000, 10000);
		const arrowHelperZ = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 500000, "#0000ff", 50000, 10000);
		holder.add(arrowHelperX);
		holder.add(arrowHelperY);
		holder.add(arrowHelperZ);

		this.sceneObjs.scene.add(holder);
		this.sceneObjs.axis = holder;

	}

	async makeBeltLayer(height, innerOverride, outerOverride, material) {
		var beltGem = new THREE.RingGeometry(
			EOS_SIZE + DIST_TO_BELT + innerOverride,
			EOS_SIZE + DIST_TO_BELT + BELT_THICK + outerOverride,
			BELT_QUALITY,
			1,
		);

		const Belt = new THREE.Mesh(beltGem, material);
		Belt.material.side = THREE.DoubleSide;
		Belt.rotation.set(Math.PI / 2, 0, 0);
		this.sceneObjs.Belt = Belt;

		this.sceneObjs.Belt.position.set(0, height, 0)

		//Belt.matrixAutoUpdate = false

		this.sceneObjs.scene.add(Belt);
	}

	//Casts a ray and returns what points are hit
	castRay(screenX, screenY) {
		const x = (screenX / window.innerWidth) * 2 - 1;
		const y = -(screenY / window.innerHeight) * 2 + 1;
		const mouse = new THREE.Vector2(x, y);
		this.raycaster.setFromCamera(mouse, this.sceneObjs.camera);
		var intersects = this.raycaster.intersectObjects(
			this.pointManager.points.filter((p) => p.shown).map((p) => p.marker),
			true
		);
		return intersects;
	}

	getScreenPos(worldPos) {
		const width = app.sceneObjs.renderer.domElement.width;
		const height = app.sceneObjs.renderer.domElement.height;
		const widthHalf = width / 2;
		const heightHalf = height / 2;

		const pos = worldPos instanceof THREE.Vector3 ? worldPos.clone() : new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
		pos.project(this.sceneObjs.camera);
		pos.x = -pos.x * widthHalf + widthHalf;
		pos.y = -(pos.y * heightHalf) + heightHalf;
		return pos;
	}
	//Figures out how the map should handle a user click
	handleSceneClick(event) {
		const intersects = this.castRay(event.clientX, event.clientY);
		if (intersects.length > 0) {
			if (event.type == "dblclick") {
				//On double click we zoom into the object
				const pos = this.pointManager.getByThreeId(
					intersects[0].object.uuid
				).position;
				this.cameraController.lerpCamTo(pos.x, pos.y, pos.z);
			}
			if (this.isShiftHeld) {
				const target = this.pointManager.getByThreeId(
					intersects[0].object.uuid
				);
				this.calculator.setPoints(this.pointManager.focusedPOI, target);
			} else {
				this.handleObjectClick(intersects[0].object);
			}
		}
	}
	//Sets up a bunch of event handlers for the UI
	UISetup() {
		document.body.onmousemove = () => this.lastMouseMoved = Date.now();
		// document.body.
		$(".info-container").draggable({
			containment: "document",
			cancel: ".no-drag",
			start: function () {
				$(this).css({
					right: "auto",
				});
			},
			stop: function () {
				$(this).css({
					left: "",
					right: $(window).width() -
						($(this).offset().left + $(this).outerWidth()),
				});
			},
		});
		// Settings popup
		this.settings.init();

		this.makeBelt()


		// Calculator popup
		this.calculator.init();

		// New point popup
		$(".add-point").draggable({
			containment: "document",
		});
		$(".win-prop-close").click(function () {
			$(this).parent().hide();
		});
		// New point button
		const self = this;
		$("#new-point").click(function () {
			if (app.user.isPubToken) {
				app.modalConfirm("Login Required")
				return;
			}
			self.updateFormMode.call(self, "create");
			const curType = document.getElementById("type-select").value;
			self.updateSubtypes(curType);
			$(".add-point").show();
		});
		const typeSelector = document.getElementById("type-select");
		typeSelector.onchange = function (e) {
			self.updateSubtypes(e.target.value);
		};

		$(".add-point form").submit(async function (e) {
			e.preventDefault();
			let serialized = $(this).serializeArray();
			const group = self.user.g.find(
				(group) => group.id == serialized[3].value
			);
			let data = {
				name: serialized[0].value,
				desc: serialized[1].value,
				type: serialized[2].value,
				groupID: group.id,
				subtype: serialized[4].value,
				pos: {
					x: parseInt(serialized[5].value),
					y: parseInt(serialized[6].value),
					z: parseInt(serialized[7].value),
				},
				showPrev: false,
			};
			$(this).parent().hide();
			if (
				group.isPublicRead &&
				!await app.modalConfirm(
					"This will create a point on a PUBLIC layer, make sure this is correct"
				)
			) {
				return;
			}
			const submitType = e.originalEvent.submitter.value;
			if (submitType == "Create") {
				const res = await self.api.createPoint(data);
				if (res == 200) {
					if (group.hasReview) {
						self.banner(
							"The point has been submitted for review",
							SUCCESS
						);
					}
				} else {
					self.banner("The point could not be created", ERROR);
				}
			} else {
				const res = await self.api.updatePoint(self.updatePointId, data);
				if (res == 200) {
					if (group.hasReview) {
						self.banner(
							"The point update has been submitted for review",
							SUCCESS
						);
					}
				} else {
					self.banner("The point could not be created", ERROR);
				}
			}
		});

		document.getElementById("login").onclick = function () {
			self.storage.removeItem("jwt"); // Remove old jwt

			// setCookie("authRedirect", AUTH_REDIR, 1);
			window.location.href = URLS.login[ENV];
		};
		document.getElementById("logout").onclick = async function () {
			if (app.user.isPubToken) {
				app.modalConfirm("You're already logged out.")
				return;
			}
			if (!await app.modalConfirm("Would you like to logout?")) return;
			self.storage.removeItem("jwt");
			self.setLoggedIn(false);
		};
		const divElm = this.sceneObjs.renderer.domElement;
		divElm.addEventListener("click", this.handleSceneClick.bind(this));
		divElm.addEventListener("dblclick", this.handleSceneClick.bind(this));
		const form = document.getElementById("filterFormTypes");

		for (var t in TYPES) {
			const type = TYPES[t];
			let template = viewFilterTemplate;
			template = template.replace("%NAME%", type.name);
			template = template.replace("%NAME%", type.name);
			template = template.replace("%NAME%", type.name);
			template = template.replace("%NAME%", type.name);
			template = template.replace("%ID%", `type-filter-${parseTypeName(type.name)}`);
			template = template.replace("%INFO%", type.info);
			form.innerHTML += template;
		}
		form.innerHTML += "<br>";
		form.onchange = this.updateFilters.bind(this);

		const sortToggle = document.getElementById("sortToggle");
		const pointsMode = document.getElementById("points");
		const layersMode = document.getElementById("layers");
		sortToggle.onclick = function () {
			if (pointsMode.style.display == "block") {
				pointsMode.style.display = "none";
				layersMode.style.display = "block";
			} else {
				pointsMode.style.display = "block";
				layersMode.style.display = "none";
			}
		};

		const acceptBtn = document.getElementById("acceptCookies");
		const popup = document.getElementById("popup");
		// const popupContent = document.getElementById("popup-content");
		acceptBtn.onclick = function () {
			self.storage.setItem("shown-new", "yes");
			popup.style.display = "none";
		};
		const hasBeenShown = self.storage.getItem("shown-new") == "yes";
		if (!hasBeenShown) {
			popup.style.display = "block";
		}

		//Searchbar code
		const searchbar = document.getElementById("find");
		const points = document.getElementById("points");
		searchbar.onkeyup = function () {
			pointsMode.style.display = "block";
			layersMode.style.display = "none";
			for (var i = 0; i < points.childElementCount; i++) {
				const point = self.pointManager.getById(
					points.children[i].id.substring("side-".length)
				);
				if (
					point.info.name
					.toLowerCase()
					.includes(searchbar.value.toLowerCase())
				) {
					points.children[i].classList.remove("search-hide");
				} else {
					points.children[i].classList.add("search-hide");
				}
			}
		};

		window.onkeydown = function (e) {
			if (e.keyCode == 16) {
				self.isShiftHeld = true;
			}
		};
		window.onkeyup = function (e) {
			if (e.keyCode == 16) {
				self.isShiftHeld = false;
			}
		};
		window.onresize = function () {
			self.sceneObjs.camera.aspect = window.innerWidth / window.innerHeight;
			self.sceneObjs.camera.updateProjectionMatrix();
			self.sceneObjs.renderer.setSize(window.innerWidth, window.innerHeight);
		};
		window.onmousemove = function (e) {
			mouseX = e.x;
			mouseY = e.y;
		};
	}

	async makeBelt() {
		//Belt
		const startPos = 0 - (BELT_HEIGHT / 2)
		const endPos = 0 + (BELT_HEIGHT / 2)

		const BELT_RING_COUNT = this.beltSamples
		const BELT_TRANSPARENCY = this.beltTransparency

		let i = 0;

		const startTime = Date.now()

		const beltTexture = new THREE.TextureLoader().load("../assets/planetTex.png");

		let beltMat = new THREE.MeshBasicMaterial({
			color: 0xffffff,
			opacity: (BELT_TRANSPARENCY / BELT_RING_COUNT),
			transparent: true,
		});

		beltMat.depthWrite = false;
		beltMat.needsUpdate = true;

		if (BELT_RING_COUNT == 2) {
			this.makeBeltLayer(0, -35000, 0, beltMat)
		} else {
			while (i < BELT_RING_COUNT - 1) {
				i++

				let height = startPos + ((BELT_HEIGHT / BELT_RING_COUNT) * i)

				let distToCentre;

				if (height > 0) {
					distToCentre = i - (BELT_RING_COUNT / 2)
				} else if (height === 0) {
					distToCentre = 0
				} else {
					distToCentre = (BELT_RING_COUNT / 2) - i
				}

				let distToEdge = (BELT_RING_COUNT / 2) - distToCentre

				//Thanks to g.w.a.c.a for the help with creating this
				let x = Math.sqrt(distToEdge / BELT_RING_COUNT)
				let offset = -x * BELT_EDGE_RADIUS

				this.makeBeltLayer(height, offset, (-offset * 25), beltMat)
			}
		}

		const endTime = Date.now()

		console.log(endTime - startTime + "ms to load the belt.")
	}

	updateSubtypes(newType, defaultTo) {
		const dropDownSubtypes = document.getElementById("subtype-select");
		dropDownSubtypes.innerHTML = "";
		TYPES[newType].subtypes.forEach((colOption) => {
			const option = document.createElement("option");
			option.value = colOption.name;
			option.innerText = colOption.name;
			option.style.color = colOption.hex;
			dropDownSubtypes.appendChild(option);
		});
		if (defaultTo) {
			dropDownSubtypes.value = defaultTo;
		}
	}

	arrowHoverEffectStart(element) {
		element.innerText = "> " + element.innerText + " <"
	}

	arrowHoverEffectEnd(element) {
		element.innerText = element.innerText.slice(2, -2)
	}
	showHeatLayers(name, opacity = 1) {
		function fromGamePos(position) {
			return {
				x: position.y + pointOffset.x,
				y: position.z + pointOffset.y,
				z: -position.x + pointOffset.z,
			};
		}

		function prefixZeros(num, len) {
			let ret = num.toString();
			while (ret.length < len) {
				ret = "0" + ret;
			}
			return ret;
		}

		const mins = {
			x: -1000000,
			y: -1000000,
			z: -1000000
		}
		const maxs = {
			x: 1000000,
			y: 1000000,
			z: 1000000
		}
		const pos = fromGamePos(mins);
		const imgWidth = 500;
		const imgHeight = 500;
		const planeWidth = (maxs.x - mins.x);
		const planeHeight = (maxs.y - mins.y);
		const scaleX = planeWidth / imgWidth;
		const scaleY = planeHeight / imgHeight;
		const ySteps = (maxs.z - mins.z) / HEATMAN_TOTAL_IMAGES; // Reeee ISAN why is "Z" up/down not "Y"
		// Create the planes
		let imgIdx = 0;
		const loader = new THREE.TextureLoader();
		// "frame_${imgIdx}_delay-0.1s.png"
		for (let y = mins.z; y < maxs.z; y += ySteps) {
			const texture = loader.load(`assets/heatmap/${name}/frame_${prefixZeros(imgIdx, 3)}_delay-0.1s.png`);
			const alphaTexture = loader.load(`assets/heatmap/${name}/frame_${prefixZeros(imgIdx, 3)}_delay-0.1s.png-alpha.png`);
			imgIdx++;
			const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight, 8, 8);
			const material = new THREE.MeshBasicMaterial({
				// color: 0xffff00,
				side: THREE.DoubleSide,
				map: texture,
				alphaMap: alphaTexture,
				transparent: true,
				opacity: opacity,
				// wireframe: true
			});
			const plane = new THREE.Mesh(geometry, material);
			plane.position.set(pos.x + planeWidth / 2, y, pos.z - planeHeight / 2);
			plane.rotation.set(Math.PI / 2, 0, 0);
			this.sceneObjs.scene.add(plane);
			this.heatmap.push(plane);
		}
	}
	//Fills out the info pannel whenever a point is clicked on
	handleObjectClick(object) {
		// console.log("Handling click");
		//Creates the info in the top right window
		const self = this;
		//Allow threejs object OR my point data object
		const poiData = object.uuid ?
			this.pointManager.getByThreeId(object.uuid) :
			object;
		this.calculator.handlePointClick(poiData);
		this.pointManager.focusedPOI = poiData;

		// Toggle flip effect on Button
		document.getElementById("dropdown-minimize").style.transform =
			"scaleY(1)";

		var template = infoTemplate;

		template = template.replace("%POINT_NAME%", poiData.info.name);

		if (((2 * poiData.info.name.length) + poiData.info.type.length) > 39) {
			template = template.replace("%BRINJECT%", "</br>");
		} else {
			template = template.replace("%BRINJECT%", "");
		}

		template = template.replace("%CREATOR%", poiData.info.createdBy);
		template = template.replace("%DESCRIPTION%", poiData.info.desc);
		template = template.replace("%TYPE%", poiData.info.type);
		template = template.replace(
			"%TYPE_IMAGE%",
			TYPES[poiData.info.type].icons.info
		);
		template = template.replace("%LAYER%", poiData.group);
		template = template.replace("%CREATED_AT%", poiData.info.createdAt);
		template = template.replace("%EDITED_AT%", poiData.info.editedAt);

		template = template.replace("%IMAGE_URL%", poiData.imageUrl); //There are two URL's that need to be filled
		template = template.replace("%IMAGE_URL%", poiData.imageUrl);
		template = template.replace("%IMAGE_DISPLAY%", poiData.imageUrl ? "block" : "none");

		const pos = poiData.info.gamePos;
		template = template.replace("%POS_X%", formatNumber(pos.x));
		template = template.replace("%POS_Y%", formatNumber(pos.y));
		template = template.replace("%POS_Z%", formatNumber(pos.z));

		var options = "";

		var optionNone = optionTemplate;
		optionNone = optionNone.replace("%NAME%", "----");
		optionNone = optionNone.replace("%VALUE%", "");

		options += optionNone;

		this.pointManager.points.forEach((point) => {
			// Prevent a point appearing in its own distance selector
			if (poiData.id != point.id) {
				var option = optionTemplate;
				option = option.replace("%VALUE%", point.id);
				option = option.replace("%NAME%", point.info.name);

				options += option;
			}
		});

		template = template.replace("%OPTIONS%", options);

		const userGroup = this.user.g.find((g) => g.id == poiData.groupID);
		const canDelete =
			(userGroup && userGroup.modify) || poiData.ownerID == this.user.id;
		if (canDelete) {
			template += updatePointTemplate;
			template += deletePointTemplate;
		}
		const infoWindow = document.getElementById("infoWindow");
		infoWindow.innerHTML = template;
		infoWindow.style.display = "";

		//Also move the info window near the point
		if (this.moveInfoOnClick) {
			const container = document.getElementsByClassName("info-container");
			const infoContainer = container[0];
			const screenPos = this.getScreenPos(object.position);
			if (!screenPos) return; // Whats
			infoContainer.style.right = `${
				screenPos.x - infoContainer.clientWidth - 100
			}px`;
			infoContainer.style.top = `${
				screenPos.y - infoContainer.clientHeight / 2
			}px`;
		}

		//Handles pressing the update point button
		$("#update-point").click(function () {
			self.updateFormMode.call(self, "update");
			self.autoFillForm(poiData);
			const curType = document.getElementById("type-select").value;
			self.updateSubtypes(curType, poiData.subtype);
			self.updatePointId = poiData.id;
			$(".add-point").show();
		});
		//Sharable link
		const getLink = document.getElementById("linksharable");
		getLink.onclick = function () {
			const identifier = poiData.vanity ? poiData.vanity : poiData.urlID;
			const link = window.location.origin + "/" + identifier;
			copyToClipboard(link);
			self.banner("Link has been copied to clipboard", SUCCESS);
		};

		const epiValsBtn = document.getElementById("epivals");
		epiValsBtn.onclick = function () {
			const str = `${poiData.info.gamePos.x} ${poiData.info.gamePos.y} ${poiData.info.gamePos.z}`;
			copyToClipboard(str);
			self.banner("Coordinates have been copied to clipboard", SUCCESS);
		};

		//Delete button
		if (canDelete) {
			const delBtn = document.getElementById("delete-point");
			delBtn.onclick = async function () {
				if (await app.modalConfirm("Are you sure you want to delete this point?")) {
					infoWindow.innerHTML = "";
					self.api.deletePoint(poiData.id);
				}
			};
		}
		//Camera focus button
		const focusBtn = document.getElementById("focus");
		focusBtn.onclick = function () {
			self.cameraController.lerpCamTo(
				poiData.position.x,
				poiData.position.y,
				poiData.position.z
			);
		};
	}
	//Main running loop, called ~60x per second
	run() {
		this.sceneObjs.EosClouds.rotation.y += 0.0001;
		const dist = constrain(this.cameraController.dist, DIST_MIN, DIST_MAX);
		const markerScale = map(
			dist,
			DIST_MIN,
			DIST_MAX,
			MARKER_SIZE_MIN,
			MARKER_SIZE_MAX
		);
		//Lets see if the scrollbar is visible on the sidenav, if it is we want to expand the sidenav a bit
		const sidenav = document.getElementsByClassName("sidenav")[0];
		// sidenav.style.width =
		// 	parseInt(sidenav.style.width) + (160 - sidenav.scrollWidth) + "px";
		//TODO: Make this not bad. Setting style like this is *very* bad practice, and not reliable
		if (sidenav.scrollHeight > sidenav.clientHeight) {
			sidenav.style.width = "175px";
		} else {
			sidenav.style.width = "160px";
		}
		if (Date.now() - this.lastMouseMoved < FPS_DROP_TIME) {
			this.setFpsTarget(HIGH_FPS_VAL);
		} else {
			this.setFpsTarget(LOW_FPS_VAL)
		}
		if (this.heatmapAnim.active) {
			this.heatmap.forEach(plane => plane.visible = false);
			this.heatmap[Math.floor(this.heatmapAnim.idx)].visible = true;
			this.heatmapAnim.idx += this.heatmapAnim.speed;
			if (this.heatmapAnim.idx >= this.heatmap.length || this.heatmapAnim.idx < 0) {
				this.heatmapAnim.speed *= -1;
				if (this.heatmapAnim.idx >= this.heatmap.length) this.heatmapAnim.idx--;
				else this.heatmapAnim.idx++;
			}
		}
		//Check hovers
		const hovers = this.castRay(mouseX, mouseY);
		this.pointManager.points.forEach((p) => p.updateHoverMain(false));
		if (hovers.length > 0) {
			const point = this.pointManager.getByThreeId(hovers[0].object.uuid);
			point.updateHoverMain(true);
		}
		this.pointManager.points.forEach((point) => {
			const rot = this.sceneObjs.camera.rotation;
			point.nameText.rotation.set(rot.x, rot.y, rot.z);
			point.marker.rotation.set(rot.x, rot.y, rot.z);
		});
		this.pointManager.runScales(markerScale);
		this.pointManager.runZones();
		this.cameraController.update();
		this.sceneObjs.renderer.render(
			this.sceneObjs.scene,
			this.sceneObjs.camera
		);
	}
	updateTheme01(newColor01) {
		document.documentElement.style.setProperty("--user-style", newColor01);
	}
	updateTheme02(newColor02) {
		document.documentElement.style.setProperty("--user-style-02", newColor02);
	}
	updateTheme03(newColor03) {
		document.documentElement.style.setProperty("--user-style-03", newColor03);
	}
	updateTheme04(newColor04) {
		document.documentElement.style.setProperty("--user-style-04", newColor04);
	}

	modalConfirm(text) {
		return new Promise(resolve => {
			document.getElementById("betterConfirm-text").innerText = text;

			document.getElementById("betterConfirm").style.display = "block"

			document.getElementById('betterConfirm-yes').onclick = function () {
				document.getElementById("betterConfirm").style.display = "none";
				console.log("yes")
				resolve(true);
			};

			document.getElementById('betterConfirm-no').onclick = function () {
				document.getElementById("betterConfirm").style.display = "none";
				console.log("no")
				resolve(false);
			};
		});
	}

	//Called whenever a user successfully logs in, fills out the group options from user object
	onLogin() {
		const form = document.getElementById("filterFormLayers");
		form.innerHTML = "";
		this.user.g.forEach((group) => {
			let template = viewFilterTemplate;
			template = template.replace("%NAME%", group.name);
			template = template.replace("%NAME%", group.name);
			template = template.replace("%NAME%", group.name);
			template = template.replace("%NAME%", group.name);
			template = template.replace("%ID%", `group-filter-${group.id}`);
			template = template.replace("%INFO%", group.info);
			form.innerHTML += template;
		});
		$(function () {
			$(document.body).on("click", ".filter-view-option", function (e) {
				if (e.target.nodeName == "LABEL") {
					const checkBox = e.target.parentElement.children[0];
					checkBox.checked = !checkBox.checked;
					form.onchange();
				} else if (e.target.nodeName == "DIV") {
					const checkBox = e.target.children[0];
					checkBox.checked = !checkBox.checked;
					form.onchange();
				}
			});
		});

		form.innerHTML += "<br>";
		form.onchange = this.updateFilters.bind(this);

		const sidenav = document.getElementById("layers");
		sidenav.innerHTML = "";
		this.user.g.forEach((layer) => {
			const header = document.createElement("p");
			header.className = "layerheader";
			header.id = `layer-header-${layer.id}`;
			header.innerText = layer.name;

			header.addEventListener("mouseover", function () {
				app.arrowHoverEffectStart(this);
			})
			header.addEventListener("mouseleave", function () {
				app.arrowHoverEffectEnd(this);
			})

			const div = document.createElement("div");
			div.id = `sort-div-${layer.id}`;

			sidenav.appendChild(header);
			sidenav.appendChild(div);
			header.onclick = function () {
				for (var i = 0; i < div.childElementCount; i++) {
					const content = div.children[i];
					if (content.style.maxHeight) {
						content.style.maxHeight = null;
						content.classList.add("nopadding");
					} else {
						content.style.maxHeight = content.scrollHeight + "px";
						content.classList.remove("nopadding");
					}
				}
			};
		});

		app.setLoadingMessage("Setting up points...")
		this.pointManager.updateLayers();
		this.cameraController.posLerpTo(EOS_SIZE * 1.6, 100000, 100000);
		this.api.getPoints();
		this.api.authorizeWebsocket(this.storage.getItem("jwt"));
		if (this.user.isPubToken) {
			const addPointMsg = document.getElementById("add-point-message")
			addPointMsg.innerText = "Login to Add Point"
		}
		if (this.user.g.some((layer) => layer.id == "MqJZYstndHmaxIEG")) {
			//User is a subr, lets set their style
			this.updateTheme01("#b72015");
		}
		//Load in the toggled filters (defer execution to ensure html elements get loaded)
		setTimeout(this.initFilters.bind(this), 0);
	}
	onLogout() {
		window.location.reload();
	}
	//Used by the api confirmJWT to set our logged in state
	setLoggedIn(newState) {
		this.isLoggedIn = newState;
		let loginBtn = document.getElementById("login");
		// let logoutBtn = document.getElementById("logout");
		let addPointBtn = document.getElementById("new-point");

		// if (!loginBtn) {
		// 	return;
		// }
		//This sets if the button is visible or not
		if (newState) {
			loginBtn.style.display = "none";
			// logoutBtn.style.display = "block";

			document.getElementById("add-point-message").innerText = "Add Point"
			if (!this.lastLoginState) {
				this.onLogin();
			}
			this.lastLoginState = true;
		} else {
			loginBtn.style.display = "block";
			logout.style.display = "none";
			document.getElementById("new-point").style.display = "none";
			// logoutBtn.style.display = "none";
			if (this.lastLoginState) {
				this.onLogout();
			}
			this.lastLoginState = false;
		}
	}
	//Fills out the "create point" window when editing a point
	autoFillForm(point) {
		document.getElementById("formName").value = point.info.name;
		document.getElementById("formDesc").value = point.info.desc;
		document.getElementById("type-select").value = point.info.type;
		document.getElementById("formXPos").value = point.info.gamePos.x;
		document.getElementById("formYPos").value = point.info.gamePos.y;
		document.getElementById("formZPos").value = point.info.gamePos.z;
		document.getElementById("group-select").value = point.groupID;
		document.getElementById("subtype-select").value = point.subtype;
	}
	//We resue the same HTML elements for creating and updating a point, need to update a few things about it however
	updateFormMode(mode) {
		//Also need to update the drop down groups
		const dropDownGroups = document.getElementById("group-select");
		dropDownGroups.innerHTML = "";
		this.user.g.forEach((group) => {
			if (group.write) {
				const option = document.createElement("option");
				option.value = group.id;
				option.innerText = group.name;
				dropDownGroups.appendChild(option);
			}
		});
		//And update the type list, could be more efficent by doing onload but meh this is more reliable
		const dropDownTypes = document.getElementById("type-select");
		dropDownTypes.innerHTML = "";
		for (var t in TYPES) {
			const type = TYPES[t];
			const option = document.createElement("option");
			option.value = parseTypeName(type.name);
			option.innerText = parseTypeName(type.name);
			dropDownTypes.appendChild(option);
		}
		if (mode == "update") {
			document.getElementById("add-point-submit").value = "Update";
			document.getElementById("formLegend").innerText = "Update Point";
		} else {
			document.getElementById("add-point-submit").value = "Create";
			document.getElementById("formLegend").innerText = "Create Point";
		}
	}
	banner(txt, code) {
		const divElm = document.getElementById("topBanner");
		divElm.style.display = "block";
		if (code == ERROR) {
			divElm.style.backgroundColor = "rgba(255,0,0,0.8)";
		} else {
			divElm.style.backgroundColor = "rgba(0,128,0,0.8)";
		}
		const text = document.getElementById("bannerMsg");
		text.innerText = txt;
		setTimeout(function () {
			divElm.style.display = "none";
		}, 4000);
	}

	async setFpsTarget(target) {
		if (this.prevFrameTarget != target) {
			console.log(`FPS target changed from ${this.prevFrameTarget} to ${target}`);
			this.prevFrameTarget = target;
		}
		this.frameInterval = 1000 / target;
	}
}

const app = new App();
window.app = app;

let now, delta, then = Date.now();

function animate() {
	requestAnimationFrame(animate);
	now = Date.now();
	delta = now - then;
	//update time dependent animations here at 30 fps
	if (delta > app.frameInterval) {
		app.stats.begin();
		app.run();
		app.stats.end();
		then = now - (delta % app.frameInterval);
	}
}

window.onload = function () {
	app.init();
	// setTimeout(() => {
	// 	app.showHeatLayers()
	// }, 1500);
	animate();
};