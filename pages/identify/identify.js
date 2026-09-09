const {
  speciesList,
  getSpeciesByName
} = require('../../data/species.js')

const {
  TENCENT_MAP_KEY
} = require('../../config/config.js')


Page({

  data: {

    imagePath: "",

    // AI 原始识别结果
    result: null,

    // 用户最终确认物种
    confirmedSpecies: null,

    // 是否显示纠错列表
    showSpeciesSelector: false,

    // 统一物种数据库
    speciesList: speciesList

  },


  // =========================
  // 1. 选择图片
  // =========================
  chooseImage() {

    wx.chooseMedia({

      count: 1,

      mediaType: ['image'],

      sourceType: [
        'album',
        'camera'
      ],


      success: (res) => {

        const path =
          res.tempFiles[0].tempFilePath


        this.setData({

          imagePath: path,

          result: null,

          confirmedSpecies: null,

          showSpeciesSelector: false

        })

      }

    })

  },


  // =========================
  // 2. 模拟 AI 识别
  // =========================
  identifyAnimal() {

    if (!this.data.imagePath) {

      wx.showToast({

        title: '请先选择图片',

        icon: 'none'

      })

      return

    }


    wx.showLoading({

      title: 'AI识别中'

    })


    setTimeout(() => {

      wx.hideLoading()


      const leopardCat =
        getSpeciesByName('豹猫')


      const result = {

        id:
          leopardCat
            ? leopardCat.id
            : 2,

        chineseName:
          leopardCat
            ? leopardCat.name
            : '豹猫',

        scientificName:
          leopardCat
            ? leopardCat.scientificName
            : 'Prionailurus bengalensis',

        confidence: 96,

        description:
          '当前为模拟 AI 识别结果。正式版将接入真实物种识别模型。'

      }


      this.setData({

        result,

        confirmedSpecies: null,

        showSpeciesSelector: false

      })

    }, 1000)

  },


  // =========================
  // 3. 用户确认 AI 正确
  // =========================
  confirmAIResult() {

    const result =
      this.data.result


    if (!result) {
      return
    }


    const species =
      getSpeciesByName(
        result.chineseName
      )


    if (!species) {

      wx.showToast({

        title: '物种资料不存在',

        icon: 'none'

      })

      return

    }


    this.setData({

      confirmedSpecies: species,

      showSpeciesSelector: false

    })


    wx.showToast({

      title: '已确认识别结果',

      icon: 'success'

    })

  },


  // =========================
  // 4. AI 识别不准确
  // =========================
  showCorrectionList() {

    if (!this.data.result) {
      return
    }


    this.setData({

      showSpeciesSelector: true,

      confirmedSpecies: null

    })

  },


  // =========================
  // 5. 用户选择正确物种
  // =========================
  selectSpecies(event) {

    const name =
      event.currentTarget.dataset.name


    const species =
      getSpeciesByName(name)


    if (!species) {

      wx.showToast({

        title: '物种信息不存在',

        icon: 'none'

      })

      return

    }


    this.setData({

      confirmedSpecies: species,

      showSpeciesSelector: false

    })


    wx.showToast({

      title: `已选择${species.name}`,

      icon: 'none'

    })

  },


  // =========================
  // 6. 修改最终确认物种
  // =========================
  changeConfirmedSpecies() {

    this.setData({

      showSpeciesSelector: true

    })

  },


  // =========================
  // 7. 选择更合适的地点名称
  // =========================
  buildLocationName(result) {

    if (!result) {

      return '当前位置'

    }


    // =========================
    // 第一优先：
    // 腾讯推荐地址
    // 通常比直接拿 pois[0] 更自然
    // =========================

    if (
      result.formatted_addresses &&
      result.formatted_addresses.recommend
    ) {

      const recommend =
        result.formatted_addresses.recommend.trim()


      if (recommend) {

        return recommend

      }

    }


    // =========================
    // 第二优先：
    // 从附近 POI 中寻找更合适的地点
    // =========================

    if (
      result.pois &&
      result.pois.length > 0
    ) {

      // 不希望优先展示的一些过于泛化名称
      const avoidKeywords = [

        '人民政府',

        '政府',

        '公安局',

        '派出所',

        '委员会'

      ]


      // 优先找一个不是政府机构类的 POI
      const betterPoi =
        result.pois.find((poi) => {

          const title =
            poi.title || ''


          if (!title) {

            return false

          }


          const shouldAvoid =
            avoidKeywords.some(
              keyword =>
                title.includes(keyword)
            )


          return !shouldAvoid

        })


      if (
        betterPoi &&
        betterPoi.title
      ) {

        return betterPoi.title

      }


      // 如果实在没有更合适的
      // 再使用第一个 POI
      if (
        result.pois[0] &&
        result.pois[0].title
      ) {

        return result.pois[0].title

      }

    }


    // =========================
    // 第三优先：
    // 腾讯返回的完整地址
    // =========================

    if (result.address) {

      return result.address

    }


    // =========================
    // 第四优先：
    // 行政区 + 街道拼接
    // =========================

    if (result.address_component) {

      const component =
        result.address_component


      const district =
        component.district || ''


      const street =
        component.street || ''


      const streetNumber =
        component.street_number || ''


      const simpleAddress =
        `${district}${street}${streetNumber}`


      if (simpleAddress) {

        return simpleAddress

      }

    }


    // =========================
    // 最终兜底
    // =========================

    return '当前位置'

  },


  // =========================
  // 8. 经纬度 → 真实地点
  // =========================
  getLocationName(
    latitude,
    longitude,
    callback
  ) {

    wx.request({

      url:
        'https://apis.map.qq.com/ws/geocoder/v1/',

      method:
        'GET',


      data: {

        location:
          `${latitude},${longitude}`,

        key:
          TENCENT_MAP_KEY,

        // 返回附近 POI
        get_poi:
          1

      },


      success: (res) => {

        console.log(
          '腾讯位置服务返回：',
          res.data
        )


        if (
          res.data &&
          res.data.status === 0 &&
          res.data.result
        ) {

          const locationDetail =
            res.data.result


          // 使用新的地点选择规则
          const locationName =
            this.buildLocationName(
              locationDetail
            )


          console.log(
            '最终选择的地点名称：',
            locationName
          )


          callback(

            locationName,

            locationDetail

          )

        } else {

          console.error(
            '逆地理编码失败：',
            res.data
          )


          callback(

            '当前位置',

            null

          )

        }

      },


      fail: (err) => {

        console.error(
          '位置接口请求失败：',
          err
        )


        // 地址解析失败时
        // 不影响 Observation 正常保存
        callback(

          '当前位置',

          null

        )

      }

    })

  },


  // =========================
  // 9. 保存 Observation
  // =========================
  saveObservation() {

    const result =
      this.data.result


    const confirmedSpecies =
      this.data.confirmedSpecies


    if (!result) {

      wx.showToast({

        title: '暂无识别结果',

        icon: 'none'

      })

      return

    }


    if (!confirmedSpecies) {

      wx.showToast({

        title: '请先确认物种',

        icon: 'none'

      })

      return

    }


    wx.showLoading({

      title: '获取位置中'

    })


    // =========================
    // 第一步：获取 GPS 坐标
    // =========================

    wx.getLocation({

      type: 'gcj02',


      success: (locationRes) => {


        const latitude =
          locationRes.latitude


        const longitude =
          locationRes.longitude


        console.log(
          '当前坐标：',
          latitude,
          longitude
        )


        wx.showLoading({

          title: '解析地点中'

        })


        // =========================
        // 第二步：
        // 坐标 → 地点名称
        // =========================

        this.getLocationName(

          latitude,

          longitude,

          (
            locationName,
            locationDetail
          ) => {


            wx.hideLoading()


            const observations =
              wx.getStorageSync(
                'observations'
              ) || []


            // =========================
            // 是否人工纠正
            // =========================

            const corrected =
              result.chineseName !==
              confirmedSpecies.name


            // =========================
            // 地址信息
            // =========================

            let province = ''

            let city = ''

            let district = ''

            let street = ''

            let streetNumber = ''

            let fullAddress = ''


            if (
              locationDetail &&
              locationDetail.address_component
            ) {

              const component =
                locationDetail.address_component


              province =
                component.province || ''


              city =
                component.city || ''


              district =
                component.district || ''


              street =
                component.street || ''


              streetNumber =
                component.street_number || ''

            }


            if (
              locationDetail &&
              locationDetail.address
            ) {

              fullAddress =
                locationDetail.address

            }


            // =========================
            // 保存腾讯推荐地址
            // 以后科研端也可能有用
            // =========================

            let recommendedAddress = ''


            if (
              locationDetail &&
              locationDetail.formatted_addresses &&
              locationDetail.formatted_addresses.recommend
            ) {

              recommendedAddress =
                locationDetail
                  .formatted_addresses
                  .recommend

            }


            // =========================
            // 创建 Observation
            // =========================

            const newObservation = {

              id:
                Date.now(),


              // -----------------
              // 最终物种
              // -----------------

              speciesId:
                confirmedSpecies.id,

              speciesName:
                confirmedSpecies.name,

              scientificName:
                confirmedSpecies.scientificName,


              // -----------------
              // AI 原始判断
              // -----------------

              aiSpeciesName:
                result.chineseName,

              aiScientificName:
                result.scientificName,

              aiConfidence:
                result.confidence,


              // 兼容现有页面
              confidence:
                result.confidence,


              // 是否经过人工纠正
              corrected:
                corrected,


              // -----------------
              // 图片与时间
              // -----------------

              imagePath:
                this.data.imagePath,

              time:
                new Date().toLocaleString(),


              // -----------------
              // GPS 坐标
              // -----------------

              latitude:
                latitude,

              longitude:
                longitude,


              // -----------------
              // 展示地点
              // -----------------

              locationName:
                locationName,


              // -----------------
              // 完整地址数据
              // -----------------

              fullAddress:
                fullAddress,

              recommendedAddress:
                recommendedAddress,

              province:
                province,

              city:
                city,

              district:
                district,

              street:
                street,

              streetNumber:
                streetNumber

            }


            // =========================
            // 保存本地 Observation
            // =========================

            observations.unshift(
              newObservation
            )


            wx.setStorageSync(

              'observations',

              observations

            )


            console.log(
              '保存成功：',
              newObservation
            )


            wx.showToast({

              title: '观察记录已保存',

              icon: 'success'

            })


            // =========================
            // 保存后清空页面
            // =========================

            setTimeout(() => {

              this.setData({

                imagePath: "",

                result: null,

                confirmedSpecies: null,

                showSpeciesSelector: false

              })

            }, 1000)

          }

        )

      },


      fail: (err) => {

        wx.hideLoading()


        console.error(
          '获取位置失败：',
          err
        )


        wx.showModal({

          title:
            '无法获取位置',

          content:
            '当前没有获得定位权限。请检查微信开发者工具或系统中的定位权限。',

          confirmText:
            '知道了',

          showCancel:
            false

        })

      }

    })

  },


  // =========================
  // 10. 查看物种详情
  // =========================
  goToSpeciesDetail() {

    const confirmedSpecies =
      this.data.confirmedSpecies


    const result =
      this.data.result


    let name = ''


    if (confirmedSpecies) {

      name =
        confirmedSpecies.name

    } else if (result) {

      name =
        result.chineseName

    }


    if (!name) {

      return

    }


    wx.navigateTo({

      url:
        `/pages/species/species?name=${encodeURIComponent(name)}`

    })

  }

})