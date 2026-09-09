Page({

  data: {

    // 默认地图中心
    latitude: 22.35,
    longitude: 113.54,

    // 地图标记
    markers: [],

    // 当前选中的观察记录
    selectedObservation: null,

    // 是否显示地图下方详情卡
    showAnimalCard: false,

    // 总观察记录数量
    observationCount: 0
  },


  // 每次进入地图页都重新读取数据
  onShow() {
    this.loadMapData()
  },


  loadMapData() {

    // 读取全部 Observation
    const observations =
      wx.getStorageSync('observations') || []


    // 只保留有有效经纬度的数据
    const validObservations =
      observations.filter(item => {

        return (
          typeof item.latitude === 'number' &&
          typeof item.longitude === 'number'
        )

      })


    // 每一条 Observation
    // 对应地图上的一个 Marker
    const markers =
      validObservations.map(
        (observation, index) => {


          // 统计这个物种一共被观察过多少次
          const recordCount =
            validObservations.filter(
              item =>
                item.speciesName ===
                observation.speciesName
            ).length


          return {

            // Marker 自己的 id
            id: 1000 + index,


            latitude:
              observation.latitude,


            longitude:
              observation.longitude,


            title:
              observation.speciesName,


            width: 36,

            height: 36,


            // 非常重要：
            // 保存这一条 Observation 的真正 id
            observationId:
              observation.id,


            // 点击 Marker 后显示的数据
            observation: {

              id:
                observation.id,


              speciesName:
                observation.speciesName,


              scientificName:
                observation.scientificName,


              locationName:
                observation.locationName ||
                "观察地点",


              time:
                observation.time,


              confidence:
                observation.confidence,


              imagePath:
                observation.imagePath || "",


              latitude:
                observation.latitude,


              longitude:
                observation.longitude,


              recordCount:
                recordCount

            }

          }

        }
      )


    // 如果存在观察记录
    // 地图自动移动到最新记录
    if (validObservations.length > 0) {

      this.setData({

        latitude:
          validObservations[0].latitude,

        longitude:
          validObservations[0].longitude

      })

    }


    // 更新页面
    this.setData({

      markers:
        markers,

      observationCount:
        validObservations.length,

      selectedObservation:
        null,

      showAnimalCard:
        false

    })


    console.log(
      '当前观察记录：',
      validObservations
    )


    console.log(
      '当前地图 Marker：',
      markers
    )

  },


  // 点击地图 Marker
  onMarkerTap(e) {

    const markerId =
      e.detail.markerId


    // 根据 Marker id
    // 找到对应 Marker
    const marker =
      this.data.markers.find(
        item =>
          item.id === markerId
      )


    if (!marker) {
      return
    }


    // 保存这一次具体 Observation
    this.setData({

      selectedObservation:
        marker.observation,

      showAnimalCard:
        true

    })

  },


  // 关闭详情卡
  closeAnimalCard() {

    this.setData({

      showAnimalCard:
        false,

      selectedObservation:
        null

    })

  },


  // 查看“这一次”观察
  goToObservationDetail() {

    const observation =
      this.data.selectedObservation


    if (!observation) {

      wx.showToast({
        title: "观察记录不存在",
        icon: "none"
      })

      return

    }


    wx.navigateTo({

      url:
        `/pages/observation/observation?id=${observation.id}`

    })

  },


  // 查看这个物种的档案
  goToSpeciesDetail() {

    const observation =
      this.data.selectedObservation


    if (!observation) {
      return
    }


    wx.navigateTo({

      url:
        `/pages/species/species?name=${encodeURIComponent(
          observation.speciesName
        )}`

    })

  },


  // 没有观察记录时
  // 前往 AI 识别
  goToIdentify() {

    wx.switchTab({

      url:
        '/pages/identify/identify'

    })

  }

})