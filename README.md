# Agents for robot learning

**Fan Zhang · Michael Gienger · Honda Research Institute Europe**

[Project website](https://fan6zh.github.io/agenticrobot/) · [Fan Zhang](https://fan6zh.github.io/)

An interactive presentation of a research workflow connecting real robot observations, MuJoCo reconstruction, Blender rendering, simulator controllers, reinforcement learning and π0.5 fine-tuning. The running example is an SO-101 robot picking up a vial and placing it on a rack.

## Explore

Choose any of the five workflow steps. Compare MuJoCo and Blender with the appearance slider, play the external and wrist camera views, or watch the complete 50-second overview film.

The site uses plain HTML, CSS and JavaScript. All images, fonts and 14 videos are local assets. No installation, build process, account or API key is needed to view it. Open `index.html` directly or serve this directory with a static web server.

## GitHub Pages

The repository is designed for `https://fan6zh.github.io/agenticrobot/`.

In **Settings → Pages**, select **Deploy from a branch**, choose **main** and **/ (root)**, then save. `.nojekyll` publishes the static files directly. Asset paths are relative and work under the project subfolder. Later pushes to `main` update the website.

This repository contains the presentation website and its media, rather than the complete robot-training workspace.

## Scope of the examples

- Real robot videos show recorded demonstrations and data collection.
- Simulation examples show executable control code and image-based SAC trained from scratch, using images and measured robot state.
- Rendered-data and real-data π0.5 fine-tuning were separate experiments initialized from the base policy. The flow does not claim sequential checkpoint transfer, joint fine-tuning or zero-shot learned-policy deployment on hardware.
- The section labelled **World-action model** presents the saved visual forecasting prototype. Its implemented predictor conditions on image history without action input; the example does not establish held-out generalization.

The researcher guides the task and reviews results while Codex helps construct environments, write code, prepare data and run learning experiments.

## Credits

Workflow presentation inspired by [RoboSimStudio](https://robosimstudio.github.io/). The website implementation and project media are our own. The bundled Lato fonts retain their license in `assets/fonts/LICENSE.txt`.
