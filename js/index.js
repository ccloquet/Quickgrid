$(window).load(onDeviceReady)

var url_base  = 'https://grid.my-poppy.eu/' 		// trailing / is important so that some QR code readers are able to read the url
var url_stats = 'https://grid.my-poppy.eu/stats.php'
var x0y0      = [152200, 153000]; // in EPSG31370
var delta     = 100; // in meters
var bea       = 0;   // in degrees
var xlabels   = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j','k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v','w', 'x', 'y', 'z'];
var ylabels   = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'];
var mycrs     = null
var mysec     = 0;
var WP        = null;
var LG        = null
var LH        = null
var CM	      = null
var mymap     = null
var map_state = 0
var current_url = 0
var myurl     = ''
var qrcode    = null
var the_line  = null
var sep_url   = '?'
var myPhotonMarker = null
var WIDTH_LIMIT = 1036

var tms  = [
               
           ]

var TL        = null
var epsg_31370_str = '+lat_0=90 +lat_1=51.16666723333333 +lat_2=49.8333339 '
		         +'+lon_0=4.367486666666666 '
       			 +'+x_0=150000.013 +y_0=5400088.438 '
	       		 +'+ellps=intl '
	       		 +'+proj=lcc '
			 +'+towgs84=-106.869,52.2978,-103.724,0.3366,-0.457,1.8422,-1.2747 '
	       		 +'+units=m '
	       		 +'+no_defs'
var editableLayers
var lineLayers
var blink_watch = null
var TYPEREF     = 'master'

function onDeviceReady() 
{
	$( document ).ready(function() 
	{
		$("body").height($(window).height())
	});
	$('.togglemap').click(toggle_map)

	init()

	/*if(window.applicationCache) 
	{
		window.applicationCache.onupdateready = function(e) 
		{
			window.alert('Une mise à jour est prête, rechargez la page pour la télécharger')
		}
	}*/


	// HAMMER 
	var myElement 	= document.getElementById('map2');
	
	// create a manager for that element
	var manager 	= new Hammer.Manager(myElement);
	// create recognizers
	var Pan 	= new Hammer.Pan();
	var Pinch 	= new Hammer.Pinch();
	var Rotate 	= new Hammer.Rotate();
	// use them together
	Rotate.recognizeWith([Pan]);
	Pinch.recognizeWith([Rotate, Pan]);

	// add the recognizers
	manager.add(Pan);
	manager.add(Rotate);
 
	// subscribe to events
	var currentRotation = 0, lastRotation, startRotation;
	manager.on('rotatemove', function(e) {
	    // do something cool
	    var diff = startRotation - Math.round(e.rotation);
	  currentRotation = lastRotation - diff;
	    //$.Velocity.hook($stage, 'rotateZ', currentRotation + 'deg');
	mymap.setBearing(currentRotation)
	});

	manager.on('rotatestart', function(e) {
	  lastRotation = currentRotation;
	  startRotation = Math.round(e.rotation);
	});

	manager.on('rotateend', function(e) {
	    // cache the rotation
	    lastRotation = currentRotation;
	});

	if ($(window).width() < WIDTH_LIMIT)
	{
		$('#btn-grid').html('<i class="fa fa-pencil"></i> Grille')
		$('#btn-link').html('<i class="fa fa-share-alt"></i>')
		$('#btn-line').hide()
		$('.lbr').show()
		$('#btn-upload').html('<i class="fa fa-upload"></i> Parcours')
		$('#btn-kml').html('<i class="fa fa-download"></i> KML')
		$('.mapicons').css('width', '30%')
	}
}

function init()
{
	  if (window.location.href.indexOf('my-poppy') > -1) 	// condition to avoid sending stats for tests
	  { 
		$.get(url_stats)				// send stats to server -> only the timestamp is recorded, no ip
	  }

	  if (window.location.href.indexOf(sep_url) > -1)	// a grid or a line is stored
	  {
		$('#app2').hide()
		$('#app').show()
		$('#maptools').hide()

		init_map()

		var s = window.location.href.split(sep_url)
		s = s[1]

		if (s.indexOf('lineblob') > -1)		// LINE
		{
			TYPEREF = 'line'

			function callback(d)
			{
				var mylayers 	= L.geoJSON(d, {style: {color: '#f357a1',weight: 5}}) 
				lineLayers.addLayer(mylayers)
				
				var LL 		= mylayers.getLayers()[0]._latlngs

				mycrs 		= new L.Proj.CRS("EPSG:999999","+proj=tmerc +lat_0="+LL[0].lat+" +lon_0="+LL[0].lng+" +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

				the_line   	= build_line(LL)
				show_km(LL, the_line.XY, the_line.s_sum, the_line.my_s)
			}

			// retrieve the blob & show the line
			var id  = s.split('lineblob=')[1]
			get_line(id, callback)
		}
		else					// GRID
		{
			TYPEREF = 'grid'

			s       = s.split(',')
			x0y0    = [s[0], s[1]]
			delta   = s[2]
			bea     = s[3]

			var LAT0 = 0,              LNG0 = 0
			var Nx0  = xlabels.length, Ny0  = xlabels.length

			if (s.length > 4)
			{
				LAT0 = s[4]
				LNG0 = s[5]
	 	
				mycrs = new L.Proj.CRS("EPSG:999999","+proj=tmerc +lat_0="+LAT0+" +lon_0="+LNG0+" +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

				if (s.length > 6)
				{
					Nx0 = s[6]
					Ny0 = s[7]
				}
			}
			else
			{
				mycrs = new L.Proj.CRS('EPSG:31370', epsg_31370_str, { resolutions: [8192, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1] })
				$('#coord_caption').text('Lambert 72')
				Nx0 = xlabels.length
				Ny0 = ylabels.length
			}
			show_grid({x:x0y0[0],y:x0y0[1]}, xlabels, ylabels, delta, Nx0, Ny0, bea)
		}

		$("#myupdateicon").html('<i class="fa fa-spinner fa-spin"></i>')
		$("#myupdatetext").html('Acquiring position')

		if (WP == null) get_position()

		setInterval(
			function()
			{
				check_last_update()
				if (WP == null) get_position()
			}, 
		5000)	
		
  	  }
	  else				// blank map
	  {
		$('#app').hide()
		$('#app2').show()
		$('.togglemap').hide()

		init_map()

		$('.btn-back').parent().parent().hide()

		$('#btn-line').on('click', create_line )
		$('#btn-grid').on('click', create_grid )
		$('#btn-link').on('click', function()
		{ 
			if (myurl == "") return

			$('#qrcode-wrap').css('top', $(window).height()/2-325/2).css('left', $(window).width()/2-275/2)

			$("#qrcode-wrap").fadeIn()
			$('#qrcode-text').val(myurl) 		

			if (qrcode != null) 
			{
				qrcode.clear()
				qrcode.makeCode(myurl)
			}
			else
			{
				qrcode = new QRCode("qrcode", 
				{
					text: 		myurl,
					width: 		175,
	    				height: 	175,
					colorDark  : 	"#000000",
					colorLight : 	"#ffffff",
    					correctLevel : 	QRCode.CorrectLevel.L
				});
			}
		})
		$('#btn-kml').on('click',  
		function()
		{ 
			var json = LH.toGeoJSON(); 
			console.log(json); 

			var kml  = tokml(json); download(kml, 'grid_' + Date.now() + '.kml', "text/plain");
		})

		window.alert('Quickgrid : se repérer par rapport à un quadrillage ou à un parcours. Pour un résultat optimal, dessinez la grille ou le parcours sur ordinateur, puis chargez le lien sur mobile.\n\nVIE PRIVÉE: Votre localisation est utilisée pour centrer la carte, elle n\'est pas transmise au serveur. Si vous utilisez un service externe de localisation (ex : Google), votre position peut lui être transmise. Les parcours que vous tracez sont stockées sur jsonblob.com et accessible à tout qui connaît le lien public. Nous enregistrons la date et l\'heure de votre passage, le pays de votre adresse IP (sans transmission à un serveur tiers) ainsi qu\'une empreinte (fonction sha1) de votre adresse IP, afin de gérer au mieux ce service. Plus d\'infos : https://docs.my-poppy.eu/privacy.html.\n\nFourni sans aucune garantie. Référez-vous au code source sur GitHub (ccloquet/quickgrid)')
	}

	if ($(window).width() < WIDTH_LIMIT) $('.leaflet-control-easyPrint').hide()
}

function mobileAndTabletcheck() 
{
//https://stackoverflow.com/questions/11381673/detecting-a-mobile-browser
  var check = false;
  (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
  return check;
};

function create_line(e)
{
	if (mobileAndTabletcheck() )
	{
		window.alert('Vous avez besoin d\'un ordinateur avec souris pour utiliser cette fonction')
	}
	else
	{
		window.alert('Cliquez sur les points du parcours'); 
		new L.Draw.Polyline(mymap, {shapeOptions:  {color: '#f357a1',weight: 5}}).enable() 			
	}
}

function create_grid(e)
{
	if (mobileAndTabletcheck() )
	{
		window.alert('Double-cliquez sur le coin supérieur droit de la grille')
		mymap.on('dblclick', function(e)
		{
			delta          	= window.prompt('Taille d\'un carré (mètres)')
			mycrs 	     	= new L.Proj.CRS("EPSG:999999","+proj=tmerc +lat_0="+e.latlng.lat+" +lon_0="+e.latlng.lng+" +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
			var X0Y0     	= mycrs.projection.project(e.latlng)
		 
			bea   		= mymap.getBearing()
			show_grid(X0Y0, xlabels, ylabels, delta, xlabels.length, ylabels.length, bea)
			myurl 		= url_base + sep_url + Math.round(X0Y0.x) + ',' + Math.round(X0Y0.y) + ',' + delta + ',' + bea + ',' + e.latlng.lat + ',' + e.latlng.lng +',' + xlabels.length  +',' + ylabels.length
		
			mymap.off('dblclick')
		})
	}
	else
	{
		window.alert('Dessinez la zone couverte par la grille'); 
		if (LG != null)
		{
			mymap.removeLayer(LG)
		}
		var rect  = new L.Draw.Rectangle(mymap, {shapeOptions: {color: '#FFF'}})
		rect.enable();
	}

}
	
function toggle_map()
{
	if (map_state == 0)
	{
		show_map()
		get_position()
		if (LG != null) mymap.fitBounds(LG.getBounds())
		else if (lineLayers != null)   mymap.fitBounds(lineLayers.getBounds())
	}
	else
	{
		$('#app2').hide()
		$('#app').show()
	}
	map_state = 1-map_state
}

function show_map()
{
	$('#app').hide()
	$('#app2').show()
	mymap.invalidateSize()
}
function myPhotonHandler(e)
{
	var LL = [e.geometry.coordinates[1], e.geometry.coordinates[0]]
	if (myPhotonMarker != null) mymap.removeLayer(myPhotonMarker)
	myPhotonMarker = new L.CircleMarker(LL, {color: 'red',fillOpacity:.75,weight: 1})
	myPhotonMarker.addTo(mymap)
	mymap.setView(LL, 13);
}
function init_map()
{
	$('#map2').height($(window).height() - $("#app2").height())

	mymap = L.map('map2', 
	{
		zoomDelta:.25, 
		zoomSnap:.25, 
		rotate:true, 
		photonControl: true,
		photonControlOptions: 
		{
			placeholder: 'Adresse',
			position: 'topleft',
			onSelected: myPhotonHandler,
		}
	}).setView([50, 4], 13);

	mymap.locate({setView : true});
	L.control.scale().addTo(mymap);
 
	TLayer_set()

	L.easyButton('fa-step-backward btn-back',  toggle_map, 'back', 'topright').addTo( mymap );  

	L.easyButton('fa-rotate-left',     function(btn, map){ mymap.setBearing(mymap.getBearing()-2) }, 'rotate map', 'topright').addTo( mymap );  
	L.easyButton('fa-rotate-right',    function(btn, map){ mymap.setBearing(mymap.getBearing()+2) }, 'rotate map', 'topright').addTo( mymap );  

	L.easyButton('fa-map',      function(btn, map)
	{
		++current_url
		current_url = current_url%tms.length
		
		mymap.removeLayer(TL)
		TLayer_set()
		
	}, 'change basemap', 'topright').addTo( mymap );  

	L.easyButton('fa-copyright', function(btn, map)
	{
		window.alert(	"Développé par Poppy, 2018\n" 
				+"contact: christophe@my-poppy.eu\n"
				+"web: www.my-poppy.eu\n\n"
				+"Crédits:\n"
				+"font-awesome-4.7.0 [github.com/FortAwesome/Font-Awesome/blob/master/LICENSE.txt]\n"
				+"leaflet-1.3.1 fork by va2ron1 [github.com/va2ron1/Leaflet/blob/master/LICENSE]\n"
				+"Leaflet.EasyButton-1.1.1 [github.com/CliffCloud/Leaflet.EasyButton/blob/master/LICENSE]\n"
				+"Leaflet.Omnivore-0.3.3 [https://github.com/mapbox/leaflet-omnivore/blob/master/LICENSE]\n"
				+"leaflet-ruler [github.com/gokertanrisever/leaflet-ruler/blob/master/LICENSE.md]\n"
				+"hammer-2.0.8.js [github.com/hammerjs/hammer.js/blob/master/LICENSE.md]\n"
				+"Proj4Leaflet [github.com/kartena/Proj4Leaflet/blob/master/LICENSE]\n"
				+"jquery-2.1.1 [github.com/jquery/jquery/blob/master/LICENSE.txt]\n"
				+"leaflet-easyPrint [github.com/rowanwins/leaflet-easyPrint/blob/gh-pages/LICENSE]\n"
				+"tokml.js [github.com/mapbox/tokml]\n"
				+"download2.js [danml.com/download.html]\n"
		)
	}, 'credits', 'bottomleft').addTo( mymap );  

	L.easyPrint({
		title: 'Print',
		position: 'bottomright',
		sizeModes: ['Current'],
	}).addTo(mymap);
 
	// set up editable layers
	editableLayers  = L.featureGroup().addTo(mymap)
	lineLayers      = L.featureGroup().addTo(mymap)
	LH 		= L.featureGroup()

	mymap.on(L.Draw.Event.DRAWSTART, clear_editable_layers)

	mymap.on(L.Draw.Event.CREATED, function (e) 
	{
		set_new_editable_layer(e.layer, e.layerType)
    	});

	var popup = null
	editableLayers.on('mouseover',       function(e) 
	{
                var my_coords 	= L.latLng(e.latlng), idx
	  
		switch(TYPEREF)
		{
			/*case 'grid':	g   = getSquarePoint(mycrs, my_coords, delta, bea, xlabels, ylabels)
					idx = g.mysquare
					break;*/
			case 'line':	if (the_line != null)
					{
						g   = getKm(mycrs, my_coords, the_line.XY, the_line.my_s)
						idx = g.km
					}
					popup = L.popup()
						.setLatLng(e.latlng)
						.setContent(idx)
						.openOn(mymap);
					break;
		}
		
	})

	editableLayers.on('mouseout',       function(e) 
	{
		if (popup != null) popup.closePopup();
		popup = null
	})

}
function clear_editable_layers()
{
	myurl = ''
	for (var x in editableLayers._layers) 
	{
		if (editableLayers._layers.hasOwnProperty(x))
		{
			mymap.removeLayer(editableLayers._layers[x])
		}
	}
}

function set_new_editable_layer(layer, type)
{
	var LL = layer._latlngs
	
	switch(type)
	{
		case 'polyline':
			// 1. build local CRS
			mycrs = new L.Proj.CRS("EPSG:999999","+proj=tmerc +lat_0="+LL[0].lat+" +lon_0="+LL[0].lng+" +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");
	
			editableLayers.addLayer(layer)

			LH = L.featureGroup()
			LH.addLayer(layer)

			// 2. build & draw the array of segments lengths
			var my_line   	= build_line(LL)
			show_km(LL, my_line.XY, my_line.s_sum, my_line.my_s)

			//  3. convert to geoJSON and store
			store_line(layer)
			break;

		case 'rectangle':
			
			var delta_list = [1, 1.5, 2,2.5,3,5,7.5,10,15,20,25,30,50,75,100,150,200,250,300,500,750,1000, 1500, 2000, 2500, 3000, 5000, 7500, 10000]

			var LL_P_1 = 0, LL_P_3 = 0, j = -1, k = 1

			var b = mymap.getBearing()

			var s = 1
			if ( ((b > 90) & (b < 270)) | (b < -90) & (b > -270) ) s = -1

			while ( ! ((s*LL_P_1.x > 0) & (s*LL_P_3.y < 0)) )	// find the right orientation (otherwise, if start drawing from lower right -> does not display the grid correctly)
			{
				// iterate clockwise & counter clockwise
				if (j == 4) {j = 0; k = -1}
				++j
				// 1. build local CRS
				mycrs  = new L.Proj.CRS("EPSG:999999","+proj=tmerc +lat_0="+LL[mod(j,4)].lat+" +lon_0="+LL[mod(j,4)].lng+" +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

				LL_P_1 = mycrs.projection.project(LL[mod(j+k*1,4)])
				LL_P_3 = mycrs.projection.project(LL[mod(j+k*3,4)])
			}

			var dx       = Math.ceil(Math.sqrt(LL_P_1.x*LL_P_1.x + LL_P_1.y*LL_P_1.y))		// size in x
			var dy       = Math.ceil(Math.sqrt(LL_P_3.x*LL_P_3.x + LL_P_3.y*LL_P_3.y))		// size in y

			editableLayers.addLayer(layer)

			var my_delta = []			// suggested grid sizes

			for (var i=0; i<delta_list.length; ++i)
			{
				if ( (delta_list[i] >= dx/xlabels.length) & (delta_list[i] < dx/4)) my_delta.push({delta:delta_list[i], Nx:Math.ceil(dx/delta_list[i]), Ny:Math.ceil(dy/delta_list[i])})
			}
		 
			var txt = 'Choisissez le carroyage qui vous convient:\n\n'
			for (var i=0; i<my_delta.length; ++i)
			{
				txt += '[' + String.fromCharCode(65+i) + '] ' + my_delta[i].Nx + ' x ' + my_delta[i].Ny + ' (' + my_delta[i].delta + ' m)\n'
			}
			txt += 'ou entrez une taille de carré personnalisée (entre '+Math.ceil(dx/xlabels.length)+' et '+Math.floor(dx/4)+' m) :'

			var delta = null, Nx, Ny
			var ret = window.prompt(txt)

			if (ret == null) return false

			ret = ret.toUpperCase()
			var J   = ret.charCodeAt()-65

			if ($.isNumeric(ret))
			{
				delta = ret
				Nx    = Math.ceil(dx/ret)
				Ny    = Math.ceil(dy/ret)		
			}
			else if ((J >= 0) & (J <my_delta.length))
			{
				delta = my_delta[J].delta
				Nx    = my_delta[J].Nx
				Ny    = my_delta[J].Ny
			}

			if (delta != null)
			{
				bea   		= mymap.getBearing()
				show_grid({x:0, y:0}, xlabels, ylabels, delta, Nx, Ny, bea)
				myurl 		= url_base + sep_url + '0,0,' + delta + ',' + bea + ',' + LL[mod(j,4)].lat + ',' + LL[mod(j,4)].lng + ',' + Nx + ',' + Ny
			}
		 
			break;
	}
}
function mod(n, m) {
  return ((n % m) + m) % m;
}
function TLayer_set()
{
	TL = L.tileLayer(tms[current_url].url, 
		{
		attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors + '+tms[current_url].attr+', <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>', 
		subdomains:  tms[current_url].subd,
		maxZoom:     tms[current_url].maxzoom,
		opacity:     0.5,
	}).addTo(mymap);
}
function show_grid(latlng_31370, xlabels, ylabels, delta, Nx, Ny, b)
{
	// lowlevel grid
	var 	G = [], H = [],
		cb = Math.cos(b*Math.PI/180), 
		sb = Math.sin(b*Math.PI/180),
		x0 = parseFloat(latlng_31370.x),	// ! parseFloat ! otherwise string concat !!
		y0 = parseFloat(latlng_31370.y)
 
	for(var i=0; i<Nx; ++i) 
	{
		for(var j=0; j<Ny; ++j)
		{
			var xy_center = {x: x0 + cb * (i+.5) * delta + sb * (j+.5) * delta , y: y0 + sb * (i+.5) * delta - cb * (j+.5) * delta}
 
			var LL    = mycrs.projection.unproject(xy_center)	// center of the square
			var LL_TL = mycrs.projection.unproject({x: x0 + cb*(i+0)*delta + sb*(j+0) * delta, y: y0 + sb*(i+0)*delta - cb*(j+0) * delta})	// top left
			var LL_TR = mycrs.projection.unproject({x: x0 + cb*(i+1)*delta + sb*(j+0) * delta, y: y0 + sb*(i+1)*delta - cb*(j+0) * delta})	// top right
			var LL_BL = mycrs.projection.unproject({x: x0 + cb*(i+0)*delta + sb*(j+1) * delta, y: y0 + sb*(i+0)*delta - cb*(j+1) * delta})	// bottom left
			var LL_BR = mycrs.projection.unproject({x: x0 + cb*(i+1)*delta + sb*(j+1) * delta, y: y0 + sb*(i+1)*delta - cb*(j+1) * delta})	// bottom right	
 
			var lat_lngs = [LL_TL, LL_TR, LL_BR, LL_BL, LL_TL]
			var myname = ''

			if ( ( (i%2==0) & (j%2==0) ) ) 
			{
				myname     = xlabels[i].toUpperCase()+ylabels[j]
				var myIcon = L.divIcon({className:'emptyicon', html: myname});
				var marker = L.marker(LL, {icon: myIcon})
				marker.properties = {};
				marker.properties.Name = "Test"
				G.push(marker)
			}
			
			if ( (i == 0) | (j == 0 ) )
			{
				myname     = xlabels[i].toUpperCase()+ylabels[j]
				var myIcon = L.divIcon({className:'boldicon', html: myname});
				G.push(L.marker(LL, {icon: myIcon}))
				H.push(L.marker(LL, {icon: myIcon, name: myname }));			// to display the names
			}

			// one idea to draw squares ... but they are not square given the coordinate transsformation
			// var circle = new L.Circle(LL, delta/2);
			// G.push(new L.Rectangle(circle.getBounds(), {color: 'white',fillOpacity:0,weight: 1}));

			// center of the squares
			//G.push(new L.CircleMarker(LL, {color: 'white',fillOpacity:.5,weight: 1}));

			G.push(new L.Polyline(lat_lngs, {color: 'darkgray',fillOpacity:0,weight: 1}));
			H.push(new L.Polyline(lat_lngs, {color: 'darkgray',fillOpacity:0,weight: 1}));	// name might be here, but then misplaced in Google Maps for instance (QGIS would be OK)
		}
	}
	
	// High level grid delienation
 
	var LL_TL  = mycrs.projection.unproject({x: x0, 					y: y0})							// top left
	var LL_TR  = mycrs.projection.unproject({x: x0 + cb * Nx * delta, 			y: y0 + sb * Nx * delta})				// top right
	var LL_BL  = mycrs.projection.unproject({x: x0 +                   sb * Ny * delta, 	y: y0                            - cb * Ny * delta})	// bottom left
	var LL_BR  = mycrs.projection.unproject({x: x0 + cb * Nx * delta + sb * Ny * delta, 	y: y0 + sb * Nx * delta          - cb * Ny * delta})	// bottom right	
 
	var lat_lngs = [LL_TL, LL_TR, LL_BR, LL_BL, LL_TL]
	G.push(new L.Polyline(lat_lngs, {color: 'yellow',fillOpacity:0,weight: 3}));

	LG = L.featureGroup(G).addTo(mymap)	// to draw
	LH = L.featureGroup(H)			// to download
}

function check_last_update()
{
	var e        = new Date();
	var mynewsec = e.getTime()/1000;
	if ((mysec > 0) &  ( (mynewsec - mysec) > 35 ))
	{
		$("#myupdateicon").html('<i style="color:yellow" class="blink fa fa-exclamation-triangle"></i>')
		start_blink()
		navigator.geolocation.clearWatch(WP)
		WP = null
	}
	if (mysec > 60000)
	{
		//$("#myupdatetext").html('Last update: ')
	}
}

function get_position()
{
	var mytimeout = 60000, g
	
	WP = navigator.geolocation.watchPosition(
		function(p)
		{
			var my_coords  = {lng:p.coords.longitude ,lat: p.coords.latitude}

			if (map_state == 1)
			{
				if (CM != null) mymap.removeLayer(CM)
				CM = L.circleMarker( my_coords )
				CM.addTo(mymap)
			}

			switch(TYPEREF)
			{
				case 'grid':	g = getSquarePoint(mycrs, my_coords, delta, bea, xlabels, ylabels)
						$('#mysquare').html(g.mysquare)
						$('#mylambert72').html(g.mylambert72)
						break;
			
				case 'line':	if (the_line != null)
						{
							g = getKm(mycrs, my_coords, the_line.XY, the_line.my_s)
							$('#mysquare').text(g.km)
							$('#mylambert72').html(g.mylambert72)
						}
						break;
			}
			
			$('#myaccuracy').html(Math.round(p.coords.accuracy) + " m" )
			
			$('#mywgs84').html(Math.round(p.coords.latitude*10000)/10000 + ' ' + Math.round(p.coords.longitude*10000)/10000 )
			var d = new Date(p.timestamp);

			$("#myupdateicon").html('<i class="fa fa-clock-o"></i>')
			$("#myupdatetext").html('Last update: ' + d.getDate() + "/" + (d.getMonth() +1) + "/" + d.getFullYear() + " " + (d.getHours() < 10 ? '0' + d.getHours() : d.getHours())  + ":" + (d.getMinutes() < 10 ? '0' + d.getMinutes() : d.getMinutes()) + ":" + (d.getSeconds() < 10 ? '0' + d.getSeconds() : d.getSeconds()))

			mysec = p.timestamp/1000

			check_last_update()
		}, 
		function(e)
		{
			$("#myupdateicon").html('<i style="color:yellow" class="blink fa fa-exclamation-triangle"></i>')
			start_blink()
			$("#myupdatetext").html('GPS ERROR')
			navigator.geolocation.clearWatch(WP)
			WP = null
		}, 
		{maximumAge: 0, timeout: mytimeout, enableHighAccuracy: true}
	)
}

function getSquarePoint(thecrs, mycoordinates, delta, bea, caption_x, caption_y)
{
	// get the grid square where the user is
	// delta in meters
	// mycoordinates are in EPSG 4326

	var 	cb 		= Math.cos(bea * Math.PI/180), 
		sb 		= Math.sin(bea * Math.PI/180)
 
 	var 	XY 		= thecrs.projection.project(mycoordinates),
		XY_rotated      = {x:   cb * XY.x + sb * XY.y , y:  -sb * XY.x + cb * XY.y},
		eta_y 		= -(XY_rotated.y ) / delta, 
		eta_x 		=  (XY_rotated.x ) / delta,
	  	iy 		= Math.floor ( eta_y ), hy = eta_y - iy,
		ix 		= Math.floor ( eta_x ), hx = eta_x - ix,
		mysquare, complem

	console.log(mycoordinates, delta, bea, XY, XY_rotated)

	if 	((hx < .5)  & (hy < .5) ) complem = 'a'
	else if ((hx >= .5) & (hy < .5) ) complem = 'b'
	else if ((hx < .5)  & (hy >= .5)) complem = 'c'
	else if ((hx >= .5) & (hy >= .5)) complem = 'd'

	if ( (ix >=0) & (ix < caption_x.length) & (iy >=0) & (iy < caption_y.length)) 	mysquare = "<div style='margin-top:.5em !important'>" + caption_x[ix].toUpperCase()+caption_y[iy]+complem + "</div>";
	else										mysquare = "OUT OF<br>AREA"
		
	var ret =  
	{	
		mysquare: 	mysquare,
		mylambert72:	'x = ' + Math.abs(Math.round(XY.x)) + ', y = ' + Math.abs(Math.round(XY.y))
	}

	return ret;
}

function getKm(thecrs, mycoordinates, XY, my_s)
{
	// get the km index where the user is

	// XY are in metric CRS
	// mycoordinates are in EPSG 4326

	// compute euclidian distance of the point to each segment (euclidian bcz that's how we built the SCR)
	// -> my_dist : [0, d1, d2, d3, ..., dN]
	// -> my_XY :   [ [x0,y0], [x1, y1], ... ]
	// -> build an array of the distances to the segments

	var 	my_XY 	= thecrs.projection.project(mycoordinates),
		my_dot  = [], my_len_sq = [], my_dist = [], pDi

	for (var i=0; i<XY.length-1; ++i)
	{
		pDi = pDistance(my_XY.x, my_XY.y, XY[i].x, XY[i].y, XY[i+1].x, XY[i+1].y)
		my_dist.push(pDi.d)
		my_dot.push(pDi.dot)
		my_len_sq.push(pDi.len_sq)
	}

	var k   = indexOfSmallest(my_dist)	// index of the segment for which the distance to the point is the smallest

	var ret = {}
	ret.mylambert72 = 'x = ' + Math.abs(Math.round(my_XY.x)) + ', y = ' + Math.abs(Math.round(my_XY.y))

	//console.log(k, my_dist[k])
	if (my_dist[k] > 40000) 	// if distance > 200 m, ie (distance)^2 > 40000 m²
	{
		ret.km = 'OUT OF AREA'
	}		
	else
	{
		ret.km = Math.round((my_s[k] + Math.abs(my_dot[k]/Math.sqrt(my_len_sq[k])))/100)/10 + ' km' 
	 
	}

	return ret;
}

function do_blink() 
{
    	$('.blink').fadeOut(500).fadeIn(500);
}
function start_blink()
{
	blink_watch = setInterval(do_blink, 1000); //Runs every second
}

function stop_blink()
{
	clearInterval(blink_watch)
	blink_watch = null
}

function indexOfSmallest(a) 
{
	//https://blogs.msdn.microsoft.com/oldnewthing/20140526-00/?p=903
	var lowest = 0;
	for (var i = 1; i < a.length; i++) 
	{
		if (a[i] < a[lowest]) lowest = i;
	}
	return lowest;
}

function pDistance(x, y, x1, y1, x2, y2) 
{
 // https://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment
  var A = x - x1;
  var B = y - y1;
  var C = x2 - x1;
  var D = y2 - y1;

  var dot    = A * C + B * D;
  var len_sq = C * C + D * D;
 

  var param = -1;
  if (len_sq != 0) //in case of 0 length line
      param = dot / len_sq;

  var xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  }
  else if (param > 1) {
    xx = x2;
    yy = y2;
  }
  else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  var dx = x - xx;
  var dy = y - yy;
  return {dot:dot, len_sq:len_sq, d:dx * dx + dy * dy};	// ! SQUARE DISTANCE!
}

function build_line(LL)
{
	// convert the line coordinates to metric, and compute the cumulative length of the segments
	
	//1. converts e.layer._latlngs to metric (local)
	var XY = [], s_sum = 0, my_s = [0]
	for (var i=0; i<LL.length; ++i)
	{
		XY.push( mycrs.projection.project(LL[i]) )
	}

	// build the distance array
	for (var i=0; i<LL.length-1; ++i)
	{
	  	s_sum += Math.sqrt(Math.pow(XY[i].x-XY[i+1].x,2) + Math.pow(XY[i].y-XY[i+1].y,2))
		my_s.push(s_sum)
	}

	return {XY:XY, s_sum:s_sum, my_s:my_s}
}


function store_line(layer)
{
	// store the line in geojson in an online store (jsonblob) & retrieves the id

	var json = layer.toGeoJSON();

	var posts = $.ajax(
	{
		headers: 	{"Content-Type": "application/json", "Accept": "application/json"},
		type: 		"POST",
		url: 		'https://jsonblob.com/api/jsonBlob',
		data: 		JSON.stringify(json),
  		dataType: 	'json'
	});

	posts.done 
	(
		function(d,t,j)
		{		
			var ret  = j.getResponseHeader('location');
			var blob = ret.split('jsonBlob/')
			myurl    = url_base + sep_url + 'lineblob=' + blob[1]
		}
	)
}

function get_line(id, callback)
{
	// get the geojson stored from the id
	$.ajax(
	{
		headers: 	{"Content-Type": "application/json", "Accept": "application/json"},
		type: 		"GET",
		url: 		'https://jsonblob.com/api/jsonBlob/'+id,
		success:	function(d,t,j)
		{		
			callback(d)
		}
	});
}

function show_km(LL, XY, s_sum, my_s)
{
	// show the kilometric indices

	var myIcon = L.divIcon({className:'divicon', html: 0});

	editableLayers.addLayer(L.marker( LL[0], {icon: myIcon}))		// to show
	LH.addLayer(L.marker( LL[0], {icon: myIcon, name:'START'}))		// to download

	for (var i = 1; i < s_sum/1000.0; ++i)
	{
		for (var j = 1; j < my_s.length; ++j)
		{
			if (i <= my_s[j]/1000.0) break;
		}

		var delta = (i*1000.0-my_s[j-1])/(my_s[j]-my_s[j-1]), km_marker = {}
		km_marker.x = XY[j-1].x + delta * ( XY[j].x - XY[j-1].x )
		km_marker.y = XY[j-1].y + delta * ( XY[j].y - XY[j-1].y )
	 
		myIcon = L.divIcon({className:'divicon', html: i});
		editableLayers.addLayer(L.marker( mycrs.projection.unproject(km_marker), {icon: myIcon}));
		LH.addLayer(L.marker( mycrs.projection.unproject(km_marker), {icon: myIcon, name:i}));
	}
	for (var i = 1; i < 5*s_sum/1000.0; ++i)
	{
		if (i%5 == 0) continue;

		for (var j = 1; j < my_s.length; ++j)
		{
			if (i/5.0 <= my_s[j]/1000.0) break;
		}

		var delta = (i/5.0*1000.0-my_s[j-1])/(my_s[j]-my_s[j-1]), km_marker = {}
		km_marker.x = XY[j-1].x + delta * ( XY[j].x - XY[j-1].x )
		km_marker.y = XY[j-1].y + delta * ( XY[j].y - XY[j-1].y )
	 
		editableLayers.addLayer(L.circleMarker( mycrs.projection.unproject(km_marker), {radius:3, color:'black',fillColor:'black'} ));
	}

	myIcon = L.divIcon({className:'', html: '<img height="35" src="img/flag.svg">'});
	editableLayers.addLayer(L.marker( LL[LL.length-1], {icon: myIcon}));
	LH.addLayer(L.marker( LL[LL.length-1], {icon: myIcon, name:'END'}));
}

$('#qrcode-close').click(function()
{
	$('#qrcode-wrap').fadeOut()
}
)
// File upload

$("#btn-upload").click(function() 
{
	$('#file-input').click();
});

if (window.File && window.FileReader && window.FileList && window.Blob) 
{
	function renderData(file)
	{
		var reader = new FileReader();
		reader.onload = function(event)
		{
			var data = event.target.result
		 
			console.log(file, file.name, file.type, file.size)

			var type = file.name.split('.')
			type = type[type.length-1]
		 
			var layer
			switch (type)
			{
				case 'geojson':
				case 'kml':
				case 'gpx':
					layer = omnivore[type].parse(data)
				break;

			}
			layer = layer.getLayers()[0]

			clear_editable_layers()
			set_new_editable_layer(layer, 'polyline')
		}
    
		//when the file is read it triggers the onload event above.
		reader.readAsText(file);
	 
	}
 
	//watch for change  
	$( "#file-input" ).change(function() {
		renderData(this.files[0])
	});
}  
 
