# Density-counting models for dense crowds: licence research (round 16)

> **Research only. No model has been added to the repo, and none will be without the owner's approval.**
> Licences were checked on 2026-11-08 from the GitHub API (`gh api repos/<repo>` / `.../license`) and the dataset
> pages linked below. This is an engineering summary, not legal advice: counsel confirms before anything ships
> (see [`PDPA-NOTES-FOR-COUNSEL.md`](PDPA-NOTES-FOR-COUNSEL.md)).

## Why we are looking

`crowd.html` counts people with a person detector (YOLOX-Nano, Apache-2.0). At about 300 people (Shibuya) the count
collapses to 0–2 ([`CROWD-ACCURACY.md`](CROWD-ACCURACY.md)). Tiling and a higher input resolution recover some of the
far people in sparse and medium scenes (round 16 measurement in the same document), but people whose heads are
10–15 px tall cannot be separated as boxes. Density-map and point models are built for this case. They estimate a
density map or head points and add them up.

## The short answer

**None of the public pretrained density models below is clean for commercial use today.** In most cases the code licence
is permissive (MIT / Apache-2.0). The problem is the training data. Every published checkpoint is trained on
ShanghaiTech, UCF-QNRF, JHU-Crowd++ or NWPU-Crowd. JHU-Crowd++ and NWPU-Crowd forbid commercial use outright. UCF-QNRF
grants no licence. ShanghaiTech's repo is BSD-2-Clause, but its images were collected from the internet and from streets
and the licence does not clearly cover them. Most models also start from an ImageNet-pretrained VGG backbone, and the
ImageNet terms limit the database to "non-commercial research and educational purposes".

A commercial route therefore means **training our own weights** with permissive code (for example DM-Count, CLTR or PET,
all MIT) on data we have the rights to, such as owner footage recorded with consent and point-annotated. It also means
using a backbone whose pretraining data is acceptable. This is an owner decision. See "Options" at the end.

## Models

"Code" = the repository licence (GitHub API, SPDX id). Two exceptions: for P2PNet and SASNet the API returns
`NOASSERTION`, so their entries summarise the LICENSE file text itself (read in full on the check date). "Weights" =
the published checkpoints. "Data" = the datasets the published weights were trained on. "Commercial?" = whether the
published weights could ship in a paid product.

| Model (venue) | Type | Code licence | Published weights | Trained on | Commercial use of the published weights? |
|---|---|---|---|---|---|
| CSRNet (CVPR 2018), [paper](https://arxiv.org/abs/1802.10062) | density map, VGG-16 front end | Official [leeyeehoo/CSRNet-pytorch](https://github.com/leeyeehoo/CSRNet-pytorch): **no licence file** (all rights reserved by default). Re-implementation [CommissarMa/CSRNet-pytorch](https://github.com/CommissarMa/CSRNet-pytorch): MIT | Google Drive links in the official README, no separate licence | ShanghaiTech A/B, ImageNet VGG-16 | **No.** Official code is unlicensed, the data is not cleared, and the backbone uses ImageNet |
| Bayesian Loss (ICCV 2019), [paper](https://arxiv.org/abs/1908.03684) | density map, VGG-19 | [ZhihengCV/Bayesian-Crowd-Counting](https://github.com/ZhihengCV/Bayesian-Crowd-Counting): **no licence file** | Google Drive / Baidu, no licence | UCF-QNRF, ShanghaiTech, ImageNet VGG-19 | **No.** Code and weights are unlicensed and the data is not cleared |
| DM-Count (NeurIPS 2020), [paper](https://arxiv.org/abs/2009.13077) | density map, VGG-19 | [cvlab-stonybrook/DM-Count](https://github.com/cvlab-stonybrook/DM-Count): **MIT** | [Google Drive](https://drive.google.com/drive/folders/10U7F4iW_aPICM5-qJq21SXLLkzlum9tX) (QNRF, NWPU, SHA, SHB) | UCF-QNRF, NWPU-Crowd, ShanghaiTech, ImageNet VGG-19 | **No** for the published weights (NWPU is explicitly non-commercial; the others are not cleared). The code is usable to train our own |
| P2PNet (ICCV 2021), [paper](https://arxiv.org/abs/2107.12746) | head points, VGG-16-BN | [TencentYoutuResearch/CrowdCounting-P2PNet](https://github.com/TencentYoutuResearch/CrowdCounting-P2PNet): Tencent licence, clause 1: "Use in source and binary forms shall only be for the purpose of **academic research**" | `weights/SHTechA.pth` in the repo, under the same licence | ShanghaiTech A, ImageNet | **No.** The licence itself is academic-only. Do not use even the code |
| SASNet (AAAI 2021), [repo](https://github.com/TencentYoutuResearch/CrowdCounting-SASNet) | density map, VGG-16 | Tencent: **Apache-2.0** (with third-party notices) | [Google Drive](https://drive.google.com/drive/folders/17WobgYjekLTq3QIRW3wPyNByq9NJTmZ9) | ShanghaiTech A/B, ImageNet | **No** for the weights (data not cleared). The code is Apache-2.0 |
| CLTR (ECCV 2022), [paper](https://arxiv.org/abs/2202.13065) | head points, transformer (ResNet-50 backbone) | [dk-liang/CLTR](https://github.com/dk-liang/CLTR): **MIT** | `video_model.pth` on Baidu / Google Drive | **NWPU-Crowd** (non-commercial), ImageNet | **No** for the weights. The code is MIT |
| FIDTM (2021), [paper](https://arxiv.org/abs/2102.07925) | localisation map, HRNet | [dk-liang/FIDTM](https://github.com/dk-liang/FIDTM): **MIT** | Google Drive / Baidu | ShanghaiTech, QNRF, JHU, NWPU | **No** for the weights |
| PET (ICCV 2023), [paper](https://arxiv.org/abs/2308.13814) | head points, VGG-16-BN + transformer | [cxliu0/PET](https://github.com/cxliu0/PET): **MIT** | Google Drive (`SHA_model.pth`) | ShanghaiTech A, ImageNet VGG-16-BN | **No** for the weights. The code is MIT |
| STEERER (ICCV 2023), [paper](https://arxiv.org/abs/2308.10468) | density map, HRNet | [taohan10200/STEERER](https://github.com/taohan10200/STEERER): **MIT** | OneDrive (SHHB, JHU, …) | ShanghaiTech B, JHU-Crowd++ (non-commercial), … | **No** for the weights |
| APGCC (ECCV 2024), [paper](https://arxiv.org/abs/2405.10589) | head points, VGG-16-BN | [AaronCIH/APGCC](https://github.com/AaronCIH/APGCC): **MIT** | Google Drive (SHHA) | ShanghaiTech A, ImageNet | **No** for the weights |
| LSC-CNN (TPAMI 2020), [repo](https://github.com/val-iisc/lsc-cnn) | head boxes, VGG-16 | **MIT** | Google Drive | ShanghaiTech, QNRF, ImageNet | **No** for the weights |
| MCNN (CVPR 2016), [repo](https://github.com/svishwa/crowdcount-mcnn) | density map, small 3-column CNN (no ImageNet backbone) | **MIT** | in the README (Dropbox) | ShanghaiTech A/B | **No** for the weights (data). Small enough for a phone, but much less accurate than the models above |
| LWCC library, [repo](https://github.com/tersekmatija/lwcc) | wrapper: CSRNet, SFANet, Bayesian, DM-Count | **MIT** (wrapper) | downloads the checkpoints of the models above | SHA / SHB / QNRF | **No.** It inherits the weights' data problem; SFANet is GPL upstream |
| CAN, "Context-Aware Crowd Counting" (CVPR 2019), [repo](https://github.com/weizheliu/Context-Aware-Crowd-Counting) | density map | **GPL-3.0** | — | — | **No.** GPL is banned by our rules (CLAUDE.md) |
| SFANet variants, [repo](https://github.com/Pongpisit-Thanasutives/Variations-of-SFANet-for-Crowd-Counting) | density map | **GPL-3.0** | — | — | **No.** GPL is banned |
| C-3-Framework / NWPU-Crowd sample code, [repo](https://github.com/gjy3035/C-3-Framework) | training framework (MCNN, CSRNet, SANet, …) | **MIT** | per model | GCC, SHA, … | Code only. The weights follow the data |

## Training datasets

| Dataset | Terms (quoted or summarised from the source) | Commercial use? |
|---|---|---|
| ShanghaiTech A/B, [repo](https://github.com/desenzhou/ShanghaiTechDataset) | Repo licence **BSD-2-Clause** (GitHub API). Part A was collected from the internet and Part B was taken on Shanghai streets. Neither the repo nor the paper says the image owners or the people in them granted rights | **Unclear. Treat as no** until counsel says otherwise |
| UCF-QNRF, [page](https://www.crcv.ucf.edu/data/ucf-qnrf/) | No licence on the page. Images were collected from the web (Flickr, web search, Hajj footage) | **No grant. Treat as no** |
| JHU-Crowd++, [page](http://www.crowd-counting.com/) | "This dataset is for **academic and non-commercial uses** (such as academic research, teaching, scientific publications, or personal experimentation)" | **No** |
| NWPU-Crowd, [page](https://www.crowdbenchmark.com/nwpucrowd.html) | "You may **not use the dataset or any derivative work for commercial purposes** as, for example, licensing or selling the data, or using the data with a purpose to procure a commercial gain" | **No.** Trained weights are a derivative work |
| GCC (synthetic, from GTA V), [page](https://gjy3035.github.io/GCC-CL/) | No licence stated on the project page. The scenes are rendered from a commercial video game | **Unclear. Treat as no** |
| ImageNet (backbone pretraining), [terms](https://www.image-net.org/download.php) | "Researcher shall use the Database only for **non-commercial research and educational purposes**" | **Grey area.** Common in industry, but counsel should decide. YOLOX-Nano (shipped) is trained on COCO (annotations CC BY 4.0, images under their Flickr licences), which is the posture already recorded in `vendor/models/yolox/README.txt` |

## Related, not a density model

- **NVIDIA PeopleNet** ([NGC](https://catalog.ngc.nvidia.com/orgs/nvidia/teams/tao/models/peoplenet)): a person/face/bag
  *detector*. The NGC card says it is ready for commercial use under the NVIDIA Open Model License, but an NVIDIA forum
  thread ([link](https://forums.developer.nvidia.com/t/understanding-tao-models-commercial-licensing/281977)) adds EULA
  caveats. It is a detector, so it would still collapse on a dense crowd, and it is far larger than YOLOX-Nano. Listed
  only for completeness.

## Phone cost (not measured)

Every model above except MCNN uses a VGG-16/19, ResNet-50 or HRNet backbone, which is tens of millions of parameters
and far more compute per frame than YOLOX-Nano (0.9 M parameters). The round 16 timing (CROWD-ACCURACY.md) shows that
YOLOX-Nano already takes about 0.4 s per call on an emulated mid-range phone. A VGG-class density model on ORT Web WASM
would not run in real time on a phone. A realistic product would sample one frame every few seconds for a "crowd
level" figure. This has **not been measured**. A measurement would require downloading a model, so it waits for the
owner's approval.

## Options for the owner (decision needed; nothing is done until approved)

1. **Keep detector-only counting and keep the dense-crowd warning (today).** Clean licence. Honest: not for dense crowds.
2. **Train our own density/point model** with MIT code (DM-Count, CLTR or PET) on footage we have the rights to (owner or
   pilot-site recordings with consent and signage, point-annotated by people). The backbone would need data counsel
   accepts, for example COCO-pretrained, as with YOLOX. Effort: L (annotation is the main cost: about 300–500 frames of
   dense scenes). PDPA: training frames show people, so they need consent, retention limits and must stay out of the repo.
3. **Licence a commercial model** from a vendor that warrants its training data. Cost and terms unknown. This needs a
   vendor search.
4. **Research-only demo** with a published checkpoint, marked "research demo" and off in customer builds, like age/gender.
   Not recommended. Unlike age/gender (licence-limited but permitted for demo use), NWPU and JHU forbid derivative
   commercial use, and the public site is a commercial showcase.
